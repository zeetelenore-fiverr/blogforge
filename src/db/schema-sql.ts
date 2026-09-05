/**
 * The database schema, as one idempotent SQL script.
 *
 * Kept in TypeScript rather than a .sql file on purpose: it is compiled into the
 * bundle, so a serverless deploy can build its own database without depending on
 * runtime file tracing. `npm run setup` reads this same string out of this file,
 * so local and hosted installs can never drift.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  extra TEXT NOT NULL DEFAULT '{}',
  model TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  daily_limit INTEGER NOT NULL DEFAULT 0,
  used_today INTEGER NOT NULL DEFAULT 0,
  quota_reset_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  total_calls INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS providers_kind_idx ON providers (kind, enabled, priority);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  meta_title TEXT,
  meta_description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL DEFAULT '',
  content_md TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  campaign_id INTEGER,
  focus_keyword TEXT NOT NULL DEFAULT '',
  secondary_keywords TEXT NOT NULL DEFAULT '[]',
  featured_image TEXT,
  featured_image_alt TEXT,
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  canonical_url TEXT,
  schema_json TEXT NOT NULL DEFAULT '',
  noindex BOOLEAN NOT NULL DEFAULT FALSE,
  seo_score INTEGER NOT NULL DEFAULT 0,
  seo_checks TEXT NOT NULL DEFAULT '[]',
  policy_status TEXT NOT NULL DEFAULT 'unchecked',
  policy_issues TEXT NOT NULL DEFAULT '[]',
  policy_checked_at TIMESTAMPTZ,
  word_count INTEGER NOT NULL DEFAULT 0,
  reading_time INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  generation_meta TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_status_idx ON posts (status, published_at);
CREATE INDEX IF NOT EXISTS posts_category_idx ON posts (category_id);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content_md TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  show_in_header BOOLEAN NOT NULL DEFAULT FALSE,
  show_in_footer BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS keyword_clusters (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  pillar_keyword TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  intent TEXT NOT NULL DEFAULT '',
  volume INTEGER,
  difficulty INTEGER,
  cpc TEXT,
  seed TEXT NOT NULL DEFAULT '',
  cluster_id INTEGER REFERENCES keyword_clusters(id) ON DELETE SET NULL,
  campaign_id INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS keywords_kw_idx ON keywords (keyword);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused',
  keyword_source TEXT NOT NULL DEFAULT 'list',
  seed_keywords TEXT NOT NULL DEFAULT '',
  prompt_template TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 1200,
  tone TEXT NOT NULL DEFAULT 'friendly expert',
  language TEXT NOT NULL DEFAULT 'English',
  audience TEXT NOT NULL DEFAULT 'general readers',
  point_of_view TEXT NOT NULL DEFAULT 'second person',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  publish_status TEXT NOT NULL DEFAULT 'draft',
  interval_minutes INTEGER NOT NULL DEFAULT 1440,
  articles_per_run INTEGER NOT NULL DEFAULT 1,
  max_articles INTEGER NOT NULL DEFAULT 0,
  generated_count INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  featured_image_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  inline_images INTEGER NOT NULL DEFAULT 3,
  image_style TEXT NOT NULL DEFAULT 'clean editorial photograph, natural light',
  internal_links_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  max_internal_links INTEGER NOT NULL DEFAULT 5,
  external_links_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  faq_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  toc_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  key_takeaways_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  table_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  schema_type TEXT NOT NULL DEFAULT 'Article',
  text_provider_id INTEGER,
  image_provider_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload TEXT NOT NULL DEFAULT '{}',
  result TEXT NOT NULL DEFAULT '{}',
  campaign_id INTEGER,
  post_id INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  progress TEXT NOT NULL DEFAULT '',
  run_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_queue_idx ON jobs (status, run_at);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'info',
  scope TEXT NOT NULL DEFAULT 'app',
  message TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_created_idx ON logs (created_at);

CREATE TABLE IF NOT EXISTS index_status (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL UNIQUE,
  coverage_state TEXT NOT NULL DEFAULT 'unknown',
  verdict TEXT NOT NULL DEFAULT 'unknown',
  robots_txt_state TEXT NOT NULL DEFAULT '',
  indexing_state TEXT NOT NULL DEFAULT '',
  last_crawl_time TEXT,
  issues TEXT NOT NULL DEFAULT '[]',
  fixes_applied TEXT NOT NULL DEFAULT '[]',
  auto_fixed BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS internal_links (
  id SERIAL PRIMARY KEY,
  source_post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  target_post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  anchor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS links_source_idx ON internal_links (source_post_id);

CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);
`;
