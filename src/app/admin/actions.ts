'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  db, providers, campaigns, posts, categories, pages, keywords, jobs, users, logs,
  indexStatus, internalLinks,
} from '@/db';
import { signIn, signOut, requireUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { setSettings, getSettings } from '@/lib/settings';
import { slugify, json } from '@/lib/util';
import { renderMarkdown } from '@/lib/markdown';
import { errMessage, logInfo } from '@/lib/log';
import { byId } from '@/providers/catalog';
import { testProvider } from '@/providers';
import { enqueue, runJob, tick, nextRun } from '@/engine/scheduler';
import { generateArticle, refreshPostDerived, uniqueSlug } from '@/engine/generate';
import { researchKeywords, saveKeywords, clusterKeywords } from '@/engine/keywords';
import { checkPostIndexing, autoFixPost, pingIndexNow } from '@/engine/indexing';
import { addInternalLinks } from '@/engine/internal-links';

export type ActionState = { ok?: boolean; error?: string; message?: string };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();
const num = (fd: FormData, key: string, fallback = 0) => {
  const v = Number(fd.get(key));
  return Number.isFinite(v) ? v : fallback;
};
const bool = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === '1';

/* ------------------------------------------------------------------ auth */

export async function signInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, 'email');
  const password = String(fd.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const user = await signIn(email, password);
  if (!user) return { error: 'Those credentials did not match an account.' };
  redirect('/admin');
}

export async function signOutAction() {
  await signOut();
  redirect('/admin/login');
}

/* ------------------------------------------------------------- providers */

export async function saveProviderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  const providerId = str(fd, 'providerId');
  const entry = byId(providerId);
  if (!entry) return { error: 'Unknown provider.' };

  const apiKey = String(fd.get('apiKey') ?? '');
  const extra: Record<string, string> = {};
  for (const f of entry.extraFields || []) {
    const v = str(fd, `extra.${f.key}`);
    if (v) extra[f.key] = v;
    if (f.required && !v) return { error: `${f.label} is required for ${entry.name}.` };
  }
  if (entry.keyRequired && !apiKey && !id) {
    return { error: `${entry.name} needs an API key. Get a free one at ${entry.signupUrl}` };
  }

  const values = {
    kind: entry.kind,
    providerId,
    label: str(fd, 'label') || entry.name,
    extra: JSON.stringify(extra),
    model: str(fd, 'model') || entry.defaultModel || null,
    priority: num(fd, 'priority', 100),
    dailyLimit: num(fd, 'dailyLimit', 0),
    enabled: bool(fd, 'enabled'),
  };

  try {
    if (id) {
      // An empty key field on edit means "keep the stored key".
      await db
        .update(providers)
        .set({ ...values, ...(apiKey ? { apiKey: encrypt(apiKey), status: 'unknown' as const } : {}) })
        .where(eq(providers.id, id));
    } else {
      await db.insert(providers).values({ ...values, apiKey: encrypt(apiKey) });
    }
  } catch (err) {
    return { error: errMessage(err) };
  }

  revalidatePath('/admin/providers');
  return { ok: true, message: id ? 'Provider updated.' : `${entry.name} added.` };
}

export async function testProviderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  const result = await testProvider(id);
  revalidatePath('/admin/providers');
  return result.ok ? { ok: true, message: result.message } : { error: result.message };
}

export async function deleteProviderAction(fd: FormData) {
  await requireUser();
  await db.delete(providers).where(eq(providers.id, num(fd, 'id')));
  revalidatePath('/admin/providers');
}

export async function toggleProviderAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  await db
    .update(providers)
    .set({ enabled: sql`CASE WHEN ${providers.enabled} = 1 THEN 0 ELSE 1 END` })
    .where(eq(providers.id, id));
  revalidatePath('/admin/providers');
}

/* -------------------------------------------------------------- settings */

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const values: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith('$') || typeof value !== 'string') continue;
    if (key === 'section') continue;
    values[key] = value;
  }
  // Unchecked checkboxes never post; the form declares them so we can zero them.
  for (const key of String(fd.get('$booleans') || '').split(',').filter(Boolean)) {
    if (!(key in values)) values[key] = '0';
    else values[key] = '1';
  }
  delete values.$booleans;

  try {
    await setSettings(values);
  } catch (err) {
    return { error: errMessage(err) };
  }
  revalidatePath('/admin/settings');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Settings saved.' };
}

/* ------------------------------------------------------------- campaigns */

function campaignValues(fd: FormData) {
  return {
    name: str(fd, 'name'),
    status: (str(fd, 'status') || 'paused') as 'active' | 'paused' | 'completed',
    keywordSource: (str(fd, 'keywordSource') || 'list') as 'list' | 'research',
    seedKeywords: String(fd.get('seedKeywords') ?? ''),
    promptTemplate: String(fd.get('promptTemplate') ?? ''),
    wordCount: num(fd, 'wordCount', 1200),
    tone: str(fd, 'tone') || 'friendly expert',
    language: str(fd, 'language') || 'English',
    audience: str(fd, 'audience') || 'general readers',
    pointOfView: str(fd, 'pointOfView') || 'second person',
    categoryId: num(fd, 'categoryId') || null,
    authorId: num(fd, 'authorId') || null,
    publishStatus: (str(fd, 'publishStatus') || 'draft') as 'draft' | 'published',
    intervalMinutes: Math.max(5, num(fd, 'intervalMinutes', 1440)),
    articlesPerRun: Math.max(1, num(fd, 'articlesPerRun', 1)),
    maxArticles: num(fd, 'maxArticles', 0),
    featuredImageEnabled: bool(fd, 'featuredImageEnabled'),
    inlineImages: num(fd, 'inlineImages', 3),
    imageStyle: str(fd, 'imageStyle') || 'clean editorial photograph, natural light',
    internalLinksEnabled: bool(fd, 'internalLinksEnabled'),
    maxInternalLinks: num(fd, 'maxInternalLinks', 5),
    externalLinksEnabled: bool(fd, 'externalLinksEnabled'),
    faqEnabled: bool(fd, 'faqEnabled'),
    tocEnabled: bool(fd, 'tocEnabled'),
    keyTakeawaysEnabled: bool(fd, 'keyTakeawaysEnabled'),
    tableEnabled: bool(fd, 'tableEnabled'),
    schemaType: str(fd, 'schemaType') || 'BlogPosting',
    textProviderId: num(fd, 'textProviderId') || null,
    imageProviderId: num(fd, 'imageProviderId') || null,
  };
}

export async function saveCampaignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  const values = campaignValues(fd);
  if (!values.name) return { error: 'Give the campaign a name.' };

  try {
    if (id) {
      const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id));
      const scheduleChanged =
        existing.intervalMinutes !== values.intervalMinutes || existing.status !== values.status;
      await db
        .update(campaigns)
        .set({
          ...values,
          nextRunAt:
            values.status === 'active'
              ? scheduleChanged || !existing.nextRunAt
                ? nextRun(values)
                : existing.nextRunAt
              : null,
        })
        .where(eq(campaigns.id, id));
      revalidatePath(`/admin/campaigns/${id}`);
      revalidatePath('/admin/campaigns');
      return { ok: true, message: 'Campaign saved.' };
    }

    const [created] = await db
      .insert(campaigns)
      .values({ ...values, nextRunAt: values.status === 'active' ? nextRun(values) : null })
      .returning();
    revalidatePath('/admin/campaigns');
    redirect(`/admin/campaigns/${created.id}`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err; // redirect
    return { error: errMessage(err) };
  }
  return { ok: true };
}

export async function toggleCampaignAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!c) return;
  const next = c.status === 'active' ? 'paused' : 'active';
  await db
    .update(campaigns)
    .set({ status: next, nextRunAt: next === 'active' ? nextRun(c) : null })
    .where(eq(campaigns.id, id));
  revalidatePath('/admin/campaigns');
  revalidatePath(`/admin/campaigns/${id}`);
}

export async function deleteCampaignAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  await db.delete(campaigns).where(eq(campaigns.id, id));
  await db.update(posts).set({ campaignId: null }).where(eq(posts.campaignId, id));
  revalidatePath('/admin/campaigns');
  redirect('/admin/campaigns');
}

/** Queue one article now, outside the schedule. */
export async function runCampaignNowAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  await enqueue('generate', { campaignId: id }, { campaignId: id });
  await logInfo('admin', `Manual run queued for campaign #${id}`);
  revalidatePath(`/admin/campaigns/${id}`);
  revalidatePath('/admin');
}

/* ----------------------------------------------------------------- posts */

export async function generateNowAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const keyword = str(fd, 'keyword');
  if (!keyword) return { error: 'Enter a keyword or topic.' };

  const campaignId = num(fd, 'campaignId');
  const campaign = campaignId
    ? (await db.select().from(campaigns).where(eq(campaigns.id, campaignId)))[0]
    : null;

  const scheduledAt = str(fd, 'scheduledFor');
  const background = bool(fd, 'background');

  const payload = {
    keyword,
    campaignId: campaignId || null,
    scheduledFor: scheduledAt || null,
    overrides: {
      wordCount: num(fd, 'wordCount') || undefined,
      categoryId: num(fd, 'categoryId') || null,
      publishStatus: (str(fd, 'publishStatus') || 'draft') as 'draft' | 'published',
      title: str(fd, 'title') || undefined,
      tone: str(fd, 'tone') || undefined,
      language: str(fd, 'language') || undefined,
      audience: str(fd, 'audience') || undefined,
      inlineImages: fd.has('inlineImages') ? num(fd, 'inlineImages') : undefined,
    },
  };

  if (background) {
    const job = await enqueue('generate', payload);
    revalidatePath('/admin/posts');
    revalidatePath('/admin');
    return { ok: true, message: `Queued as job #${job.id}. Watch it under Activity.` };
  }

  try {
    const post = await generateArticle({
      keyword,
      campaign,
      overrides: {
        ...payload.overrides,
        scheduledFor: scheduledAt ? new Date(scheduledAt) : null,
      },
    });
    revalidatePath('/admin/posts');
    revalidatePath('/', 'layout');
    redirect(`/admin/posts/${post.id}`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: errMessage(err) };
  }
}

export async function savePostAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing post.' };

  const [existing] = await db.select().from(posts).where(eq(posts.id, id));
  if (!existing) return { error: 'Post not found.' };

  const title = str(fd, 'title');
  const slugInput = str(fd, 'slug');
  const slug = slugInput === existing.slug ? existing.slug : await uniqueSlug(slugInput || title, id);
  const status = (str(fd, 'status') || 'draft') as 'draft' | 'scheduled' | 'published';
  const scheduledAt = str(fd, 'scheduledFor');
  const contentMd = String(fd.get('contentMd') ?? '');

  try {
    await db
      .update(posts)
      .set({
        title,
        slug,
        excerpt: str(fd, 'excerpt'),
        contentMd,
        contentHtml: renderMarkdown(contentMd).html,
        metaTitle: str(fd, 'metaTitle'),
        metaDescription: str(fd, 'metaDescription'),
        focusKeyword: str(fd, 'focusKeyword'),
        secondaryKeywords: JSON.stringify(
          str(fd, 'secondaryKeywords').split(',').map((s) => s.trim()).filter(Boolean),
        ),
        categoryId: num(fd, 'categoryId') || null,
        authorId: num(fd, 'authorId') || null,
        featuredImage: str(fd, 'featuredImage') || null,
        featuredImageAlt: str(fd, 'featuredImageAlt') || null,
        canonicalUrl: str(fd, 'canonicalUrl') || null,
        noindex: bool(fd, 'noindex'),
        status,
        scheduledFor: scheduledAt ? new Date(scheduledAt) : null,
        publishedAt:
          status === 'published' ? existing.publishedAt || new Date() : existing.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id));

    await refreshPostDerived(id);
  } catch (err) {
    return { error: errMessage(err) };
  }

  revalidatePath(`/admin/posts/${id}`);
  revalidatePath('/admin/posts');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Post saved.' };
}

export async function setPostStatusAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  const status = str(fd, 'status') as 'draft' | 'published';
  const [existing] = await db.select().from(posts).where(eq(posts.id, id));
  if (!existing) return;

  await db
    .update(posts)
    .set({
      status,
      publishedAt: status === 'published' ? existing.publishedAt || new Date() : existing.publishedAt,
      scheduledFor: null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));

  if (status === 'published') {
    const s = await getSettings();
    await pingIndexNow([`${(s['site.url'] || '').replace(/\/+$/, '')}/blog/${existing.slug}`]).catch(() => false);
  }
  revalidatePath('/admin/posts');
  revalidatePath(`/admin/posts/${id}`);
  revalidatePath('/', 'layout');
}

export async function deletePostAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  await db.delete(posts).where(eq(posts.id, id));
  revalidatePath('/admin/posts');
  revalidatePath('/', 'layout');
  redirect('/admin/posts');
}

export async function bulkPostAction(fd: FormData) {
  await requireUser();
  const ids = fd.getAll('ids').map(Number).filter(Boolean);
  const op = str(fd, 'op');
  if (!ids.length) return;

  if (op === 'publish') {
    await db
      .update(posts)
      .set({ status: 'published', publishedAt: new Date(), scheduledFor: null, updatedAt: new Date() })
      .where(inArray(posts.id, ids));
  } else if (op === 'draft') {
    await db.update(posts).set({ status: 'draft', updatedAt: new Date() }).where(inArray(posts.id, ids));
  } else if (op === 'delete') {
    await db.delete(posts).where(inArray(posts.id, ids));
  } else if (op === 'recheck') {
    for (const id of ids) await refreshPostDerived(id);
  } else if (op === 'index-check') {
    for (const id of ids) await enqueue('index_check', { postId: id, autoFix: false }, { postId: id });
  }
  revalidatePath('/admin/posts');
  revalidatePath('/', 'layout');
}

export async function regenerateImageAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  const [post] = await db.select().from(posts).where(eq(posts.id, id));
  if (!post) return;

  const { generateImage } = await import('@/providers');
  const s = await getSettings();
  const image = await generateImage({
    prompt: `${post.title}. ${s['gen.imageStyle']}. No text, no watermarks, no lettering.`,
    width: 1200,
    height: 675,
    slug: post.slug,
  });
  if (image) {
    await db
      .update(posts)
      .set({
        featuredImage: image.url,
        featuredImageAlt: post.featuredImageAlt || `${post.title} — ${post.focusKeyword}`.slice(0, 125),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id));
    await refreshPostDerived(id);
  }
  revalidatePath(`/admin/posts/${id}`);
}

export async function relinkPostAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  const [post] = await db.select().from(posts).where(eq(posts.id, id));
  if (!post) return;
  const linked = await addInternalLinks(post.contentMd, {
    postId: post.id,
    title: post.title,
    focusKeyword: post.focusKeyword,
    max: 6,
    useAi: true,
  });
  if (linked.links.length) {
    await db
      .update(posts)
      .set({ contentMd: linked.markdown, contentHtml: renderMarkdown(linked.markdown).html, updatedAt: new Date() })
      .where(eq(posts.id, id));
    await refreshPostDerived(id);
  }
  revalidatePath(`/admin/posts/${id}`);
  revalidatePath('/admin/links');
}

/* -------------------------------------------------------------- keywords */

export async function researchKeywordsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const seed = str(fd, 'seed');
  if (!seed) return { error: 'Enter a seed keyword or topic.' };

  try {
    const rows = await researchKeywords(seed, {
      limit: num(fd, 'limit', 50),
      context: str(fd, 'context'),
      campaignId: num(fd, 'campaignId') || null,
      useAi: !bool(fd, 'skipAi'),
    });
    const saved = await saveKeywords(rows, { campaignId: num(fd, 'campaignId') || null });
    revalidatePath('/admin/keywords');
    return {
      ok: true,
      message: `Found ${rows.length} keywords, ${saved} new. ${rows.length - saved} were already in your list.`,
    };
  } catch (err) {
    return { error: errMessage(err) };
  }
}

export async function addKeywordsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const raw = String(fd.get('keywords') ?? '');
  const list = raw.split('\n').map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return { error: 'Paste at least one keyword.' };

  const { estimateDifficulty, guessIntent } = await import('@/providers/keywords');
  const saved = await saveKeywords(
    list.map((k) => ({
      keyword: k,
      source: 'manual',
      seed: '',
      intent: guessIntent(k),
      difficulty: estimateDifficulty(k),
    })),
    { campaignId: num(fd, 'campaignId') || null },
  );
  revalidatePath('/admin/keywords');
  return { ok: true, message: `Added ${saved} new keyword${saved === 1 ? '' : 's'}.` };
}

export async function keywordBulkAction(fd: FormData) {
  await requireUser();
  const ids = fd.getAll('ids').map(Number).filter(Boolean);
  const op = str(fd, 'op');
  if (!ids.length) return;

  if (op === 'delete') await db.delete(keywords).where(inArray(keywords.id, ids));
  else if (op === 'reject') await db.update(keywords).set({ status: 'rejected' }).where(inArray(keywords.id, ids));
  else if (op === 'queue') await db.update(keywords).set({ status: 'queued' }).where(inArray(keywords.id, ids));
  else if (op === 'cluster') await clusterKeywords(ids);
  else if (op === 'generate') {
    const rows = await db.select().from(keywords).where(inArray(keywords.id, ids));
    for (const k of rows) {
      await enqueue('generate', { keyword: k.keyword, campaignId: k.campaignId });
      await db.update(keywords).set({ status: 'queued' }).where(eq(keywords.id, k.id));
    }
  } else if (op === 'assign') {
    const campaignId = num(fd, 'campaignId') || null;
    await db.update(keywords).set({ campaignId }).where(inArray(keywords.id, ids));
  }
  revalidatePath('/admin/keywords');
}

/* ------------------------------------------------------- categories/pages */

export async function saveCategoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  const name = str(fd, 'name');
  if (!name) return { error: 'Name is required.' };
  const slug = slugify(str(fd, 'slug') || name);

  const values = {
    name,
    slug,
    description: str(fd, 'description'),
    metaTitle: str(fd, 'metaTitle') || null,
    metaDescription: str(fd, 'metaDescription') || null,
  };

  try {
    if (id) await db.update(categories).set(values).where(eq(categories.id, id));
    else await db.insert(categories).values(values);
  } catch (err) {
    return { error: `Could not save — is the slug already used? (${errMessage(err)})` };
  }
  revalidatePath('/admin/categories');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Category saved.' };
}

export async function deleteCategoryAction(fd: FormData) {
  await requireUser();
  await db.delete(categories).where(eq(categories.id, num(fd, 'id')));
  revalidatePath('/admin/categories');
  revalidatePath('/', 'layout');
}

export async function savePageAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  const title = str(fd, 'title');
  if (!title) return { error: 'Title is required.' };
  const contentMd = String(fd.get('contentMd') ?? '');

  const values = {
    title,
    slug: slugify(str(fd, 'slug') || title),
    contentMd,
    contentHtml: renderMarkdown(contentMd).html,
    metaTitle: str(fd, 'metaTitle'),
    metaDescription: str(fd, 'metaDescription'),
    status: (str(fd, 'status') || 'published') as 'draft' | 'published',
    showInHeader: bool(fd, 'showInHeader'),
    showInFooter: bool(fd, 'showInFooter'),
    sortOrder: num(fd, 'sortOrder', 0),
    updatedAt: new Date(),
  };

  try {
    if (id) await db.update(pages).set(values).where(eq(pages.id, id));
    else await db.insert(pages).values(values);
  } catch (err) {
    return { error: `Could not save — is the slug already used? (${errMessage(err)})` };
  }
  revalidatePath('/admin/pages');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Page saved.' };
}

export async function deletePageAction(fd: FormData) {
  await requireUser();
  await db.delete(pages).where(eq(pages.id, num(fd, 'id')));
  revalidatePath('/admin/pages');
  revalidatePath('/', 'layout');
}

/* -------------------------------------------------------------- indexing */

export async function checkIndexingAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  if (id) {
    await checkPostIndexing(id);
  } else {
    const rows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.status, 'published'))
      .limit(25);
    for (const r of rows) await enqueue('index_check', { postId: r.id, autoFix: false }, { postId: r.id });
  }
  revalidatePath('/admin/indexing');
}

export async function autoFixAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  try {
    const result = await autoFixPost(id);
    revalidatePath('/admin/indexing');
    revalidatePath(`/admin/posts/${id}`);
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: result.applied.length
        ? `Applied ${result.applied.length} fix(es): ${result.applied.join('; ')}`
        : 'Nothing needed fixing automatically.',
    };
  } catch (err) {
    return { error: errMessage(err) };
  }
}

export async function fixAllAction(fd: FormData) {
  await requireUser();
  const rows = await db
    .select({ postId: indexStatus.postId, issues: indexStatus.issues })
    .from(indexStatus);
  for (const r of rows) {
    if (!r.postId) continue;
    const issues = json<{ autoFixable?: boolean; severity?: string }[]>(r.issues, []);
    if (issues.some((i) => i.autoFixable && i.severity !== 'info')) {
      await enqueue('seo_fix', { postId: r.postId }, { postId: r.postId });
    }
  }
  revalidatePath('/admin/indexing');
}

export async function submitToIndexNowAction(fd: FormData) {
  await requireUser();
  const s = await getSettings();
  const base = (s['site.url'] || '').replace(/\/+$/, '');
  const rows = await db
    .select({ slug: posts.slug })
    .from(posts)
    .where(and(eq(posts.status, 'published'), eq(posts.noindex, false)))
    .limit(1000);
  await pingIndexNow(rows.map((r) => `${base}/blog/${r.slug}`));
  revalidatePath('/admin/indexing');
}

/* ------------------------------------------------------------------ jobs */

export async function runTickAction() {
  await requireUser();
  await tick({ maxJobs: 5 });
  revalidatePath('/admin');
  revalidatePath('/admin/activity');
  revalidatePath('/admin/posts');
}

export async function runJobNowAction(fd: FormData) {
  await requireUser();
  const id = num(fd, 'id');
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return;
  await db.update(jobs).set({ status: 'running', startedAt: new Date() }).where(eq(jobs.id, id));
  await runJob({ ...job, status: 'running' });
  revalidatePath('/admin/activity');
  revalidatePath('/admin/posts');
}

export async function cancelJobAction(fd: FormData) {
  await requireUser();
  await db
    .update(jobs)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(eq(jobs.id, num(fd, 'id')));
  revalidatePath('/admin/activity');
}

export async function retryJobAction(fd: FormData) {
  await requireUser();
  await db
    .update(jobs)
    .set({ status: 'pending', error: null, runAt: new Date(), attempts: 0, progress: '' })
    .where(eq(jobs.id, num(fd, 'id')));
  revalidatePath('/admin/activity');
}

export async function clearLogsAction() {
  await requireUser();
  await db.delete(logs);
  revalidatePath('/admin/activity');
}

/* ---------------------------------------------------------------- author */

export async function saveProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = str(fd, 'name');
  if (!name) return { error: 'Name is required.' };

  const password = String(fd.get('password') ?? '');
  const { hashPassword } = await import('@/lib/crypto');

  await db
    .update(users)
    .set({
      name,
      slug: slugify(str(fd, 'slug') || name),
      bio: str(fd, 'bio'),
      avatarUrl: str(fd, 'avatarUrl') || null,
      ...(password.length >= 8 ? { passwordHash: hashPassword(password) } : {}),
    })
    .where(eq(users.id, user.id));

  if (password && password.length < 8) {
    return { error: 'Profile saved, but the password was too short (minimum 8 characters).' };
  }
  revalidatePath('/admin/settings');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Profile updated.' };
}

/* ------------------------------------------------------- AdSense policy */

export async function policyCheckAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  try {
    const { reviewPost } = await import('@/engine/policy-runner');
    const report = await reviewPost(id, { useAi: bool(fd, 'useAi') });
    revalidatePath(`/admin/posts/${id}`);
    revalidatePath('/admin/policy');
    const blockers = report.issues.filter((i) => i.severity === 'blocker').length;
    return {
      ok: true,
      message:
        report.status === 'pass'
          ? `Policy clear — no issues found (score ${report.score}/100).`
          : `${report.status === 'fail' ? 'Policy risk' : 'Needs review'}: ${report.issues.length} issue(s)${blockers ? `, ${blockers} blocking` : ''}.`,
    };
  } catch (err) {
    return { error: errMessage(err) };
  }
}

export async function policyCheckAllAction() {
  await requireUser();
  const rows = await db.select({ id: posts.id }).from(posts).limit(200);
  for (const r of rows) await enqueue('policy_review', { postId: r.id, useAi: false }, { postId: r.id });
  revalidatePath('/admin/policy');
  revalidatePath('/admin/activity');
}

/* ---------------------------------------------------------- page speed */

export async function pageSpeedAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const url = str(fd, 'url');
  if (!url) return { error: 'Enter a URL to test.' };

  try {
    const { pageSpeed } = await import('@/providers/seo');
    const [row] = await db
      .select()
      .from(providers)
      .where(and(eq(providers.kind, 'seo'), eq(providers.providerId, 'pagespeed')));
    const { decrypt } = await import('@/lib/crypto');
    const key = row ? decrypt(row.apiKey) : '';

    const r = await pageSpeed(url, key);
    const parts = [
      `Performance ${r.performance ?? '—'}`,
      `SEO ${r.seo ?? '—'}`,
      `Accessibility ${r.accessibility ?? '—'}`,
      `Best practices ${r.bestPractices ?? '—'}`,
      r.lcp && `LCP ${r.lcp}`,
      r.cls && `CLS ${r.cls}`,
    ].filter(Boolean);
    return { ok: true, message: `${parts.join(' · ')}${r.failedAudits.length ? ` — ${r.failedAudits.length} audits below 90` : ''}` };
  } catch (err) {
    return { error: errMessage(err) };
  }
}

/* ------------------------------------------------------------ first run */

/**
 * Creates the owner account on a fresh install. Guarded by the same
 * "no users exist yet" check the setup page uses, so it cannot be replayed to
 * mint extra owners once the site is live.
 */
export async function createOwnerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { hasAnyUser } = await import('@/lib/auth');
  if (await hasAnyUser()) return { error: 'An account already exists. Sign in instead.' };

  const name = str(fd, 'name');
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const site = str(fd, 'siteUrl').replace(/\/+$/, '');

  if (!name || !email) return { error: 'Name and email are required.' };
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };

  const { hashPassword } = await import('@/lib/crypto');
  await db.insert(users).values({
    email,
    passwordHash: hashPassword(password),
    name,
    slug: slugify(name) || 'editorial',
    role: 'owner',
    bio: 'Editorial team behind this publication. Every article is drafted with AI assistance and reviewed before publishing.',
  });

  if (site) await setSettings({ 'site.url': site });
  await logInfo('admin', 'Owner account created via the web installer');

  const { signIn } = await import('@/lib/auth');
  await signIn(email, password);
  redirect('/admin');
}

/* ---------------------------------------------------------- demo content */

export async function seedDemoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const withImages = bool(fd, 'withImages');
  try {
    const { seedDemoPosts } = await import('@/engine/demo-content');
    const created = await seedDemoPosts({ withImages });
    revalidatePath('/admin/posts');
    revalidatePath('/admin');
    revalidatePath('/', 'layout');
    return created
      ? { ok: true, message: `Added ${created} sample article${created === 1 ? '' : 's'}.` }
      : { error: 'The sample articles are already loaded.' };
  } catch (err) {
    return { error: errMessage(err) };
  }
}

/* --------------------------------------------------- AdSense policy fixes */

export async function policyFixAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const id = num(fd, 'id');
  try {
    const { fixPolicyIssues } = await import('@/engine/policy-fix');
    const result = await fixPolicyIssues(id);

    revalidatePath(`/admin/posts/${id}`);
    revalidatePath('/admin/policy');
    revalidatePath('/admin/reports');
    revalidatePath('/', 'layout');

    if (!result.applied.length) {
      return {
        error: result.skipped.length
          ? `Nothing could be fixed automatically. ${result.skipped.join('; ')}`
          : 'Nothing needed fixing.',
      };
    }
    const grew = result.words.after - result.words.before;
    return {
      ok: true,
      message:
        `Applied ${result.applied.length} fix(es): ${result.applied.join('; ')}` +
        (grew > 0 ? ` · article grew by ${grew} words to ${result.words.after}.` : '.') +
        (result.skipped.length ? ` Skipped: ${result.skipped.join('; ')}` : ''),
    };
  } catch (err) {
    return { error: errMessage(err) };
  }
}

/** Queue a fix for every article currently carrying a fixable finding. */
export async function policyFixAllAction() {
  await requireUser();
  const rows = await db
    .select({ id: posts.id, policyStatus: posts.policyStatus })
    .from(posts)
    .where(inArray(posts.policyStatus, ['fail', 'review']))
    .limit(100);

  for (const r of rows) await enqueue('policy_fix', { postId: r.id }, { postId: r.id });
  await logInfo('policy-fix', `Queued ${rows.length} article(s) for automatic fixing`);

  revalidatePath('/admin/policy');
  revalidatePath('/admin/activity');
}
