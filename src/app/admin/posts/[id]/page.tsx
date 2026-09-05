import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db, posts, categories, users, media, internalLinks, indexStatus, providers } from '@/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { json, timeAgo, formatDate } from '@/lib/util';
import { analyzeSeo, type SeoCheck } from '@/engine/seo-analyzer';
import type { PolicyIssue } from '@/engine/adsense-policy';
import { fixableIssues } from '@/engine/policy-fix';
import { PageHeader, StatusBadge, ScoreRing, PolicyBadge } from '@/components/admin/bits';
import { ActionForm, SubmitButton, ConfirmButton, CountedField, Toggle, Collapse } from '@/components/admin/ui';
import { RichEditor } from '@/components/admin/rich-editor';
import {
  savePostAction, setPostStatusAction, deletePostAction, regenerateImageAction,
  relinkPostAction, checkIndexingAction, autoFixAction, policyCheckAction, policyFixAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function PostEditor({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const postId = Number(id);

  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) notFound();

  const s = await getSettings();
  const [cats, authors, images, links, [indexRow], textProviders] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(media).where(eq(media.postId, postId)),
    db
      .select({ anchor: internalLinks.anchor, targetId: internalLinks.targetPostId })
      .from(internalLinks)
      .where(eq(internalLinks.sourcePostId, postId)),
    db.select().from(indexStatus).where(eq(indexStatus.postId, postId)),
    db
      .select({ id: providers.id })
      .from(providers)
      .where(and(eq(providers.kind, 'text'), eq(providers.enabled, true))),
  ]);

  const secondary = json<string[]>(post.secondaryKeywords, []);
  const report = analyzeSeo({
    title: post.title,
    slug: post.slug,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    excerpt: post.excerpt,
    contentMd: post.contentMd,
    focusKeyword: post.focusKeyword,
    secondaryKeywords: secondary,
    featuredImage: post.featuredImage,
    featuredImageAlt: post.featuredImageAlt,
    schemaJson: post.schemaJson,
    canonicalUrl: post.canonicalUrl,
    noindex: post.noindex,
    internalLinkCount: links.length,
  });

  const gen = json<Record<string, unknown>>(post.generationMeta, {});
  const policyIssues = json<PolicyIssue[]>(post.policyIssues, []);
  const policyFixable = fixableIssues(policyIssues, textProviders.length > 0);
  const liveUrl = `${(s['site.url'] || '').replace(/\/+$/, '')}/blog/${post.slug}`;
  const failing = report.checks.filter((c) => c.status !== 'pass');

  return (
    <div>
      <PageHeader title={post.title} description={`/blog/${post.slug}`}>
        <Link href={`/blog/${post.slug}`} target="_blank" className="btn btn-ghost">
          View ↗
        </Link>
        <form action={setPostStatusAction}>
          <input type="hidden" name="id" value={post.id} />
          <input type="hidden" name="status" value={post.status === 'published' ? 'draft' : 'published'} />
          <SubmitButton className={post.status === 'published' ? 'btn btn-ghost' : 'btn btn-primary'}>
            {post.status === 'published' ? 'Unpublish' : 'Publish now'}
          </SubmitButton>
        </form>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------------- editor */}
        <div className="min-w-0 space-y-5">
          <ActionForm action={savePostAction} className="space-y-5">
            <input type="hidden" name="id" value={post.id} />

            <div className="card space-y-4 p-5">
              <div>
                <label className="label" htmlFor="title">
                  Title
                </label>
                <input id="title" name="title" defaultValue={post.title} className="field text-base font-semibold" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="slug">
                    URL slug
                  </label>
                  <input id="slug" name="slug" defaultValue={post.slug} className="field font-mono text-xs" />
                </div>
                <div>
                  <label className="label" htmlFor="focusKeyword">
                    Focus keyword
                  </label>
                  <input
                    id="focusKeyword"
                    name="focusKeyword"
                    defaultValue={post.focusKeyword}
                    className="field"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="excerpt">
                  Excerpt
                </label>
                <textarea id="excerpt" name="excerpt" rows={2} defaultValue={post.excerpt} className="field" />
              </div>

              <div>
                <span className="label">Content</span>
                <RichEditor
                  name="contentMd"
                  defaultValue={post.contentMd}
                  media={images.map((m) => ({ url: m.url, alt: m.alt }))}
                />
                <p className="hint">
                  {report.stats.words.toLocaleString()} words · {report.stats.readingTime} min read ·{' '}
                  {report.stats.headings} headings · {report.stats.images} images · counts refresh on save
                </p>
              </div>
            </div>

            <Collapse title="Search appearance" open badge={`${report.score}/100`}>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="truncate text-xs text-green-700">{liveUrl}</p>
                  <p className="mt-0.5 truncate text-lg text-[#1a0dab]">{post.metaTitle || post.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                    {post.metaDescription || post.excerpt}
                  </p>
                </div>

                <div>
                  <label className="label" htmlFor="metaTitle">
                    Meta title
                  </label>
                  <CountedField name="metaTitle" defaultValue={post.metaTitle} ideal={[50, 60]} max={60} />
                </div>
                <div>
                  <label className="label" htmlFor="metaDescription">
                    Meta description
                  </label>
                  <CountedField
                    name="metaDescription"
                    defaultValue={post.metaDescription}
                    ideal={[140, 158]}
                    max={160}
                    textarea
                    rows={3}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="secondaryKeywords">
                    Supporting keywords
                  </label>
                  <input
                    id="secondaryKeywords"
                    name="secondaryKeywords"
                    defaultValue={secondary.join(', ')}
                    className="field"
                  />
                  <p className="hint">Comma separated. Used for scoring and schema keywords.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="canonicalUrl">
                      Canonical URL
                    </label>
                    <input
                      id="canonicalUrl"
                      name="canonicalUrl"
                      defaultValue={post.canonicalUrl || ''}
                      placeholder={liveUrl}
                      className="field text-xs"
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <Toggle
                      name="noindex"
                      defaultChecked={post.noindex}
                      label="noindex this post"
                      hint="Keeps it out of search results entirely."
                    />
                  </div>
                </div>
              </div>
            </Collapse>

            <Collapse title="Media, category and scheduling">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="categoryId">
                      Category
                    </label>
                    <select
                      id="categoryId"
                      name="categoryId"
                      className="field"
                      defaultValue={post.categoryId ?? ''}
                    >
                      <option value="">Uncategorised</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="authorId">
                      Author
                    </label>
                    <select id="authorId" name="authorId" className="field" defaultValue={post.authorId ?? ''}>
                      <option value="">No author</option>
                      {authors.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="featuredImage">
                    Featured image URL
                  </label>
                  <input
                    id="featuredImage"
                    name="featuredImage"
                    defaultValue={post.featuredImage || ''}
                    className="field text-xs"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="featuredImageAlt">
                    Featured image alt text
                  </label>
                  <input
                    id="featuredImageAlt"
                    name="featuredImageAlt"
                    defaultValue={post.featuredImageAlt || ''}
                    className="field"
                  />
                </div>
                {post.featuredImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.featuredImage}
                    alt={post.featuredImageAlt || ''}
                    className="w-full max-w-sm rounded-lg border border-slate-200"
                  />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="status">
                      Status
                    </label>
                    <select id="status" name="status" className="field" defaultValue={post.status}>
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="scheduledFor">
                      Publish at
                    </label>
                    <input
                      id="scheduledFor"
                      name="scheduledFor"
                      type="datetime-local"
                      className="field"
                      defaultValue={
                        post.scheduledFor ? toLocalInput(post.scheduledFor) : ''
                      }
                    />
                  </div>
                </div>
              </div>
            </Collapse>

            <div className="sticky bottom-4 flex justify-end">
              <SubmitButton className="btn btn-primary shadow-lg" pendingLabel="Saving…">
                Save changes
              </SubmitButton>
            </div>
          </ActionForm>
        </div>

        {/* ------------------------------------------------------ sidebar */}
        <aside className="space-y-5">
          <section className="card p-5">
            <div className="flex items-center gap-4">
              <ScoreRing score={report.score} size={60} />
              <div>
                <p className="text-sm font-semibold text-slate-900">SEO score {report.grade}</p>
                <p className="text-xs text-slate-500">
                  {report.checks.filter((c) => c.status === 'pass').length}/{report.checks.length} checks passing
                </p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs">
              <Metric label="Words" value={report.stats.words.toLocaleString()} />
              <Metric label="Density" value={`${report.stats.density}%`} />
              <Metric label="Readability" value={String(report.stats.readability)} />
              <Metric label="Avg sentence" value={`${report.stats.avgSentenceWords}w`} />
              <Metric label="Internal links" value={String(report.stats.internalLinks)} />
              <Metric label="External links" value={String(report.stats.externalLinks)} />
            </dl>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">AdSense policy</h2>
              <PolicyBadge status={post.policyStatus} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {post.policyCheckedAt ? `Checked ${timeAgo(post.policyCheckedAt)}` : 'Not checked yet'}
            </p>

            {policyIssues.length > 0 ? (
              <ul className="mt-3 space-y-2.5 border-t border-slate-100 pt-3">
                {policyIssues.map((i) => (
                  <li key={i.id} className="text-xs">
                    <p
                      className={`font-semibold ${
                        i.severity === 'blocker'
                          ? 'text-red-600'
                          : i.severity === 'warning'
                            ? 'text-amber-600'
                            : 'text-slate-600'
                      }`}
                    >
                      {i.severity === 'blocker' ? '✕' : i.severity === 'warning' ? '!' : '·'} {i.title}
                    </p>
                    <p className="text-slate-500">{i.policy}</p>
                    <p className="mt-0.5 text-slate-600">→ {i.remedy}</p>
                  </li>
                ))}
              </ul>
            ) : (
              post.policyStatus === 'pass' && (
                <p className="mt-2 text-xs text-green-700">
                  No policy issues found in this article.
                </p>
              )
            )}

            <div className="mt-3 space-y-2">
              {policyFixable.length > 0 ? (
                <ActionForm action={policyFixAction}>
                  <input type="hidden" name="id" value={post.id} />
                  <SubmitButton
                    className="btn btn-primary btn-sm w-full justify-center"
                    pendingLabel="Fixing…"
                  >
                    Fix {policyFixable.length} issue{policyFixable.length === 1 ? '' : 's'}
                  </SubmitButton>
                </ActionForm>
              ) : (
                policyIssues.length > 0 && (
                  <p className="rounded bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                    These findings need a text provider to rewrite. Add one under{' '}
                    <Link href="/admin/providers" className="font-medium text-blue-600 hover:underline">
                      AI providers
                    </Link>
                    .
                  </p>
                )
              )}
              <ActionForm action={policyCheckAction}>
                <input type="hidden" name="id" value={post.id} />
                <SubmitButton className="btn btn-ghost btn-sm w-full justify-center" pendingLabel="Checking…">
                  Re-check policy
                </SubmitButton>
              </ActionForm>
            </div>
          </section>

          {failing.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                {failing.length} thing{failing.length === 1 ? '' : 's'} to improve
              </h2>
              <ul className="mt-3 space-y-2.5">
                {failing.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
            <div className="mt-3 space-y-2">
              <form action={regenerateImageAction}>
                <input type="hidden" name="id" value={post.id} />
                <SubmitButton className="btn btn-ghost btn-sm w-full justify-center" pendingLabel="Generating…">
                  Regenerate featured image
                </SubmitButton>
              </form>
              <form action={relinkPostAction}>
                <input type="hidden" name="id" value={post.id} />
                <SubmitButton className="btn btn-ghost btn-sm w-full justify-center" pendingLabel="Linking…">
                  Rebuild internal links
                </SubmitButton>
              </form>
              <form action={checkIndexingAction}>
                <input type="hidden" name="id" value={post.id} />
                <SubmitButton className="btn btn-ghost btn-sm w-full justify-center" pendingLabel="Checking…">
                  Check indexing status
                </SubmitButton>
              </form>
              <ActionForm action={autoFixAction}>
                <input type="hidden" name="id" value={post.id} />
                <SubmitButton className="btn btn-ghost btn-sm w-full justify-center" pendingLabel="Fixing…">
                  Auto-fix SEO issues
                </SubmitButton>
              </ActionForm>
              <form action={deletePostAction}>
                <input type="hidden" name="id" value={post.id} />
                <ConfirmButton
                  className="btn btn-danger btn-sm w-full justify-center"
                  message={`Delete "${post.title}" permanently?`}
                >
                  Delete post
                </ConfirmButton>
              </form>
            </div>
          </section>

          {indexRow && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-slate-900">Google index</h2>
              <p className="mt-2 text-xs text-slate-600">
                <StatusBadge status={indexRow.verdict === 'PASS' ? 'ok' : 'unknown'} />{' '}
                {indexRow.coverageState}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Checked {timeAgo(indexRow.lastCheckedAt)}</p>
              <Link href="/admin/indexing" className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline">
                Indexing report →
              </Link>
            </section>
          )}

          {links.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-slate-900">Outgoing internal links</h2>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                {links.map((l, i) => (
                  <li key={i}>
                    <Link href={`/admin/posts/${l.targetId}`} className="hover:underline">
                      “{l.anchor}”
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {images.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-slate-900">Generated images</h2>
              <ul className="mt-3 space-y-3">
                {images.map((m) => (
                  <li key={m.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.alt} className="w-full rounded-lg border border-slate-200" />
                    <p className="mt-1 text-[11px] text-slate-500">
                      <strong>alt:</strong> {m.alt || '—'} · {m.provider}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Details</h2>
            <dl className="mt-3 space-y-1.5 text-xs">
              <Detail label="Status" value={post.status} />
              <Detail label="Created" value={formatDate(post.createdAt)} />
              <Detail label="Updated" value={timeAgo(post.updatedAt)} />
              <Detail label="Published" value={post.publishedAt ? formatDate(post.publishedAt) : '—'} />
              {typeof gen.ms === 'number' && <Detail label="Generated in" value={`${Math.round(gen.ms / 1000)}s`} />}
              {gen.providers != null && (
                <Detail
                  label="Providers"
                  value={Object.values(gen.providers as Record<string, string>).join(', ')}
                />
              )}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- fragments */

function CheckRow({ check }: { check: SeoCheck }) {
  const tone = check.status === 'fail' ? 'text-red-600' : 'text-amber-600';
  return (
    <li className="text-xs">
      <p className={`font-semibold ${tone}`}>
        {check.status === 'fail' ? '✕' : '!'} {check.label}
      </p>
      <p className="text-slate-600">{check.message}</p>
      {check.fix && <p className="mt-0.5 text-slate-500">→ {check.fix}</p>}
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

/** datetime-local wants a local-time string, not an ISO UTC one. */
function toLocalInput(d: Date): string {
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60_000).toISOString().slice(0, 16);
}
