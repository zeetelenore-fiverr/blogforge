import {
  pgTable, text, integer, boolean, timestamp, serial, index, uniqueIndex, primaryKey,
} from 'drizzle-orm/pg-core';

const now = () => new Date();

/* ------------------------------------------------------------------ auth */

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  role: text('role', { enum: ['owner', 'admin', 'editor'] }).notNull().default('admin'),
  bio: text('bio').default(''),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
});

/* -------------------------------------------------------------- settings */

/** Single key/value bag for site config, scripts and integrations. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(now),
});

/* ------------------------------------------------------------- providers */

/**
 * One row per configured API credential. `kind` groups them so the engine can
 * ask for "the next healthy text provider" and fall through the priority list
 * when one is rate limited — which free tiers do constantly.
 */
export const providers = pgTable('providers', {
  id: serial('id').primaryKey(),
  kind: text('kind', { enum: ['text', 'image', 'keyword', 'seo'] }).notNull(),
  providerId: text('provider_id').notNull(), // e.g. 'gemini', 'pollinations'
  label: text('label').notNull(),
  apiKey: text('api_key').notNull().default(''), // AES-256-GCM ciphertext
  extra: text('extra').notNull().default('{}'), // JSON: account ids, endpoints
  model: text('model'),
  priority: integer('priority').notNull().default(100), // lower runs first
  enabled: boolean('enabled').notNull().default(true),
  status: text('status', { enum: ['unknown', 'ok', 'error', 'rate_limited'] })
    .notNull()
    .default('unknown'),
  lastError: text('last_error'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  // Soft quota tracking so a free tier is not burned through in one campaign run
  dailyLimit: integer('daily_limit').notNull().default(0), // 0 = unlimited
  usedToday: integer('used_today').notNull().default(0),
  quotaResetAt: timestamp('quota_reset_at', { withTimezone: true }),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  totalCalls: integer('total_calls').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
}, (t) => [index('providers_kind_idx').on(t.kind, t.enabled, t.priority)]);

/* -------------------------------------------------------------- taxonomy */

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
});

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

/* ----------------------------------------------------------------- posts */

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  excerpt: text('excerpt').notNull().default(''),
  contentMd: text('content_md').notNull().default(''),
  contentHtml: text('content_html').notNull().default(''),
  status: text('status', { enum: ['draft', 'scheduled', 'published', 'failed'] })
    .notNull()
    .default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),

  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  campaignId: integer('campaign_id'),

  focusKeyword: text('focus_keyword').notNull().default(''),
  secondaryKeywords: text('secondary_keywords').notNull().default('[]'), // JSON string[]

  featuredImage: text('featured_image'),
  featuredImageAlt: text('featured_image_alt'),

  metaTitle: text('meta_title').notNull().default(''),
  metaDescription: text('meta_description').notNull().default(''),
  canonicalUrl: text('canonical_url'),
  schemaJson: text('schema_json').notNull().default(''), // JSON-LD @graph
  noindex: boolean('noindex').notNull().default(false),

  seoScore: integer('seo_score').notNull().default(0),
  seoChecks: text('seo_checks').notNull().default('[]'), // JSON check[]

  // AdSense programme-policy review
  policyStatus: text('policy_status', { enum: ['unchecked', 'pass', 'review', 'fail'] })
    .notNull()
    .default('unchecked'),
  policyIssues: text('policy_issues').notNull().default('[]'), // JSON PolicyIssue[]
  policyCheckedAt: timestamp('policy_checked_at', { withTimezone: true }),
  wordCount: integer('word_count').notNull().default(0),
  readingTime: integer('reading_time').notNull().default(0),
  views: integer('views').notNull().default(0),

  generationMeta: text('generation_meta').notNull().default('{}'), // providers, timings
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(now),
}, (t) => [
  index('posts_status_idx').on(t.status, t.publishedAt),
  index('posts_category_idx').on(t.categoryId),
]);

export const postTags = pgTable('post_tags', {
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.postId, t.tagId] })]);

/* ---------------------------------------------------------- static pages */

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  contentMd: text('content_md').notNull().default(''),
  contentHtml: text('content_html').notNull().default(''),
  metaTitle: text('meta_title').notNull().default(''),
  metaDescription: text('meta_description').notNull().default(''),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('published'),
  showInHeader: boolean('show_in_header').notNull().default(false),
  showInFooter: boolean('show_in_footer').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(now),
});

/* -------------------------------------------------------------- keywords */

export const keywordClusters = pgTable('keyword_clusters', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  pillarKeyword: text('pillar_keyword').notNull().default(''),
  intent: text('intent').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
});

export const keywords = pgTable('keywords', {
  id: serial('id').primaryKey(),
  keyword: text('keyword').notNull(),
  source: text('source').notNull().default('manual'), // manual|google-suggest|ai|serper
  intent: text('intent').notNull().default(''), // informational|commercial|...
  volume: integer('volume'),
  difficulty: integer('difficulty'),
  cpc: text('cpc'),
  seed: text('seed').notNull().default(''),
  clusterId: integer('cluster_id').references(() => keywordClusters.id, { onDelete: 'set null' }),
  campaignId: integer('campaign_id'),
  status: text('status', { enum: ['new', 'queued', 'used', 'rejected'] }).notNull().default('new'),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'set null' }),
  meta: text('meta').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
}, (t) => [uniqueIndex('keywords_kw_idx').on(t.keyword)]);

/* ------------------------------------------------------------- campaigns */

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'paused', 'completed'] }).notNull().default('paused'),

  // where the next keyword comes from
  keywordSource: text('keyword_source', { enum: ['list', 'research'] }).notNull().default('list'),
  seedKeywords: text('seed_keywords').notNull().default(''), // newline separated seeds

  // article shape
  promptTemplate: text('prompt_template').notNull().default(''), // blank = built-in default
  wordCount: integer('word_count').notNull().default(1200),
  tone: text('tone').notNull().default('friendly expert'),
  language: text('language').notNull().default('English'),
  audience: text('audience').notNull().default('general readers'),
  pointOfView: text('point_of_view').notNull().default('second person'),

  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),

  // publishing
  publishStatus: text('publish_status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  intervalMinutes: integer('interval_minutes').notNull().default(1440), // 1/day
  articlesPerRun: integer('articles_per_run').notNull().default(1),
  maxArticles: integer('max_articles').notNull().default(0), // 0 = unlimited
  generatedCount: integer('generated_count').notNull().default(0),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),

  // content features
  featuredImageEnabled: boolean('featured_image_enabled').notNull().default(true),
  inlineImages: integer('inline_images').notNull().default(3),
  imageStyle: text('image_style').notNull().default('clean editorial photograph, natural light'),
  internalLinksEnabled: boolean('internal_links_enabled').notNull().default(true),
  maxInternalLinks: integer('max_internal_links').notNull().default(5),
  externalLinksEnabled: boolean('external_links_enabled').notNull().default(true),
  faqEnabled: boolean('faq_enabled').notNull().default(true),
  tocEnabled: boolean('toc_enabled').notNull().default(true),
  keyTakeawaysEnabled: boolean('key_takeaways_enabled').notNull().default(true),
  tableEnabled: boolean('table_enabled').notNull().default(true),
  schemaType: text('schema_type').notNull().default('Article'),

  // provider pinning (null = automatic failover chain)
  textProviderId: integer('text_provider_id'),
  imageProviderId: integer('image_provider_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
});

/* ------------------------------------------------------------------ jobs */

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  type: text('type', {
    enum: ['generate', 'research', 'index_check', 'seo_fix', 'internal_links', 'publish', 'policy_review', 'policy_fix'],
  }).notNull(),
  status: text('status', { enum: ['pending', 'running', 'done', 'failed', 'cancelled'] })
    .notNull()
    .default('pending'),
  payload: text('payload').notNull().default('{}'),
  result: text('result').notNull().default('{}'),
  campaignId: integer('campaign_id'),
  postId: integer('post_id'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  error: text('error'),
  progress: text('progress').notNull().default(''),
  runAt: timestamp('run_at', { withTimezone: true }).notNull().$defaultFn(now),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
}, (t) => [index('jobs_queue_idx').on(t.status, t.runAt)]);

/* ------------------------------------------------------------------ logs */

export const logs = pgTable('logs', {
  id: serial('id').primaryKey(),
  level: text('level', { enum: ['debug', 'info', 'warn', 'error'] }).notNull().default('info'),
  scope: text('scope').notNull().default('app'),
  message: text('message').notNull(),
  meta: text('meta').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
}, (t) => [index('logs_created_idx').on(t.createdAt)]);

/* ------------------------------------------------------- indexing / links */

export const indexStatus = pgTable('index_status', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  url: text('url').notNull().unique(),
  coverageState: text('coverage_state').notNull().default('unknown'),
  verdict: text('verdict').notNull().default('unknown'),
  robotsTxtState: text('robots_txt_state').notNull().default(''),
  indexingState: text('indexing_state').notNull().default(''),
  lastCrawlTime: text('last_crawl_time'),
  issues: text('issues').notNull().default('[]'), // JSON issue[]
  fixesApplied: text('fixes_applied').notNull().default('[]'),
  autoFixed: boolean('auto_fixed').notNull().default(false),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
});

export const internalLinks = pgTable('internal_links', {
  id: serial('id').primaryKey(),
  sourcePostId: integer('source_post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  targetPostId: integer('target_post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  anchor: text('anchor').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
}, (t) => [index('links_source_idx').on(t.sourcePostId)]);

export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  alt: text('alt').notNull().default(''),
  prompt: text('prompt').notNull().default(''),
  provider: text('provider').notNull().default(''),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(now),
});

export type Post = typeof posts.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type PageRow = typeof pages.$inferSelect;
export type User = typeof users.$inferSelect;
