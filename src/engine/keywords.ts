import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, keywords, keywordClusters } from '@/db';
import { generateJson, researchRaw, pickProviders } from '@/providers';
import { estimateDifficulty, guessIntent } from '@/providers/keywords';
import type { KeywordSuggestion } from '@/providers/types';
import { fill, KEYWORD_RESEARCH_PROMPT, CLUSTER_PROMPT } from './prompts';
import { logInfo, logWarn, errMessage } from '@/lib/log';

export type ResearchOptions = {
  limit?: number;
  useAi?: boolean;
  useHttp?: boolean;
  campaignId?: number | null;
  /** Extra steer for the AI pass, e.g. "for a site about home coffee brewing". */
  context?: string;
};

export type ResearchedKeyword = KeywordSuggestion & {
  difficulty: number;
  cluster?: string;
  titleIdea?: string;
  volumeBand?: string;
};

/**
 * Blend every configured free source into one deduplicated, scored list.
 *
 * Google Autocomplete gives real queries; Datamuse/Wikipedia widen the entity
 * coverage; the AI pass adds intent, clustering and long-tail phrasing that the
 * suggest endpoint never surfaces. None of it costs anything.
 */
export async function researchKeywords(
  seed: string,
  opts: ResearchOptions = {},
): Promise<ResearchedKeyword[]> {
  const limit = opts.limit ?? 50;
  const merged = new Map<string, ResearchedKeyword>();

  const add = (k: KeywordSuggestion & Partial<Omit<ResearchedKeyword, keyof KeywordSuggestion>>) => {
    const key = k.keyword.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!key || key.length < 3 || key.length > 90) return;
    const existing = merged.get(key);
    if (existing) {
      // Prefer richer metadata from whichever source has it.
      existing.intent = existing.intent || k.intent;
      existing.cluster = existing.cluster || k.cluster;
      existing.titleIdea = existing.titleIdea || k.titleIdea;
      if (!existing.source.includes(k.source)) existing.source += `+${k.source}`;
      return;
    }
    merged.set(key, {
      keyword: key,
      source: k.source,
      seed,
      intent: k.intent || guessIntent(key),
      difficulty: k.difficulty ?? estimateDifficulty(key),
      volume: k.volume ?? null,
      cluster: k.cluster,
      titleIdea: k.titleIdea,
      volumeBand: k.volumeBand,
    });
  };

  if (opts.useHttp !== false) {
    try {
      for (const row of await researchRaw(seed, Math.ceil(limit * 1.5))) add(row);
    } catch (err) {
      await logWarn('keywords', 'HTTP keyword sources failed', { error: errMessage(err) });
    }
  }

  const aiEnabled = opts.useAi !== false && (await pickProviders('text')).length > 0;
  if (aiEnabled) {
    try {
      const sample = [...merged.keys()].slice(0, 40);
      const context = [
        opts.context ? `Site context: ${opts.context}` : '',
        sample.length
          ? `Autocomplete already surfaced these — extend and improve on them, do not just repeat them:\n${sample.map((s) => `- ${s}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const { data } = await generateJson<{
        keywords?: {
          keyword: string;
          intent?: string;
          difficulty?: number;
          volumeBand?: string;
          cluster?: string;
          titleIdea?: string;
        }[];
      }>(
        {
          prompt: fill(KEYWORD_RESEARCH_PROMPT, { seed, context, count: Math.min(60, limit) }),
          maxTokens: 4000,
          temperature: 0.6,
        },
        { scope: 'keywords' },
      );

      for (const k of data.keywords || []) {
        if (!k?.keyword) continue;
        add({ ...k, keyword: k.keyword, source: 'ai', seed });
      }
    } catch (err) {
      await logWarn('keywords', 'AI keyword expansion failed', { error: errMessage(err) });
    }
  }

  const out = [...merged.values()]
    .filter((k) => k.keyword !== seed.toLowerCase())
    // Easiest first — a new site should start where it can actually win.
    .sort((a, b) => a.difficulty - b.difficulty)
    .slice(0, limit);

  await logInfo('keywords', `Researched "${seed}" → ${out.length} keywords`, {
    sources: [...new Set(out.map((k) => k.source))],
  });
  return out;
}

/** Persist research results, skipping anything already in the table. */
export async function saveKeywords(
  rows: ResearchedKeyword[],
  opts: { campaignId?: number | null; clusterId?: number | null } = {},
): Promise<number> {
  if (!rows.length) return 0;

  const existing = await db
    .select({ keyword: keywords.keyword })
    .from(keywords)
    .where(inArray(keywords.keyword, rows.map((r) => r.keyword)));
  const have = new Set(existing.map((e) => e.keyword));
  const fresh = rows.filter((r) => !have.has(r.keyword));
  if (!fresh.length) return 0;

  await db.insert(keywords).values(
    fresh.map((r) => ({
      keyword: r.keyword,
      source: r.source,
      intent: r.intent || '',
      difficulty: r.difficulty,
      volume: r.volume ?? null,
      seed: r.seed || '',
      campaignId: opts.campaignId ?? null,
      clusterId: opts.clusterId ?? null,
      status: 'new' as const,
      meta: JSON.stringify({ titleIdea: r.titleIdea, cluster: r.cluster, volumeBand: r.volumeBand }),
    })),
  );
  return fresh.length;
}

/** Group loose keywords into topic clusters so the blog builds authority. */
export async function clusterKeywords(keywordIds: number[]): Promise<number> {
  if (!keywordIds.length) return 0;
  const rows = await db.select().from(keywords).where(inArray(keywords.id, keywordIds));
  if (rows.length < 3) return 0;

  const { data } = await generateJson<{
    clusters?: { name: string; pillarKeyword?: string; intent?: string; keywords: string[] }[];
  }>(
    {
      prompt: fill(CLUSTER_PROMPT, { keywords: rows.map((r) => `- ${r.keyword}`).join('\n') }),
      maxTokens: 3000,
      temperature: 0.3,
    },
    { scope: 'keywords' },
  );

  let created = 0;
  for (const c of data.clusters || []) {
    if (!c?.name || !Array.isArray(c.keywords) || !c.keywords.length) continue;
    const [cluster] = await db
      .insert(keywordClusters)
      .values({
        name: c.name,
        pillarKeyword: c.pillarKeyword || c.keywords[0],
        intent: c.intent || '',
      })
      .returning();
    created++;
    const members = rows.filter((r) => c.keywords.some((k) => k.toLowerCase() === r.keyword));
    if (members.length) {
      await db
        .update(keywords)
        .set({ clusterId: cluster.id })
        .where(inArray(keywords.id, members.map((m) => m.id)));
    }
  }
  await logInfo('keywords', `Created ${created} cluster(s) from ${rows.length} keywords`);
  return created;
}

/**
 * Next keyword a campaign should write about. Prefers keywords explicitly
 * queued for that campaign, then unassigned ones, easiest first.
 */
export async function takeNextKeyword(campaignId: number): Promise<string | null> {
  const [own] = await db
    .select()
    .from(keywords)
    .where(and(eq(keywords.campaignId, campaignId), inArray(keywords.status, ['new', 'queued'])))
    .orderBy(sql`COALESCE(${keywords.difficulty}, 50) ASC`, keywords.id)
    .limit(1);

  const pick =
    own ??
    (
      await db
        .select()
        .from(keywords)
        .where(and(sql`${keywords.campaignId} IS NULL`, eq(keywords.status, 'new')))
        .orderBy(sql`COALESCE(${keywords.difficulty}, 50) ASC`, keywords.id)
        .limit(1)
    )[0];

  if (!pick) return null;
  await db
    .update(keywords)
    .set({ status: 'queued', campaignId })
    .where(eq(keywords.id, pick.id));
  return pick.keyword;
}

export async function markKeywordUsed(keyword: string, postId: number) {
  await db
    .update(keywords)
    .set({ status: 'used', postId })
    .where(eq(keywords.keyword, keyword.toLowerCase().trim()));
}
