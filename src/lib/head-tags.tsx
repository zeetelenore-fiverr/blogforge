import React from 'react';

type Tag =
  | { kind: 'meta'; attrs: Record<string, string> }
  | { kind: 'link'; attrs: Record<string, string> }
  | { kind: 'script'; attrs: Record<string, string>; body: string }
  | { kind: 'style'; body: string };

/**
 * Parse the HTML an operator pasted into the header/footer editor.
 *
 * Verification tags and analytics snippets have to reach <head>, and a raw
 * dangerouslySetInnerHTML string never gets hoisted there. Turning them into
 * real React elements does: React lifts <meta>, <link> and <title> into the
 * document head for us.
 */
export function parseHeadTags(html: string): Tag[] {
  if (!html?.trim()) return [];
  const tags: Tag[] = [];

  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html))) {
    tags.push({ kind: 'script', attrs: parseAttrs(m[1]), body: m[2] });
  }

  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRe.exec(html))) tags.push({ kind: 'style', body: m[1] });

  const voidRe = /<(meta|link)\b([^>]*?)\/?>/gi;
  while ((m = voidRe.exec(html))) {
    const kind = m[1].toLowerCase() as 'meta' | 'link';
    tags.push({ kind, attrs: parseAttrs(m[2]) } as Tag);
  }

  return tags;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    if (!name) continue;
    attrs[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/** Map HTML attribute names onto React prop names. */
function toProps(attrs: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') out.className = v;
    else if (k === 'for') out.htmlFor = v;
    else if (k === 'charset') out.charSet = v;
    else if (k === 'http-equiv') out.httpEquiv = v;
    else if (k === 'crossorigin') out.crossOrigin = v;
    else if (k === 'referrerpolicy') out.referrerPolicy = v;
    else if (['async', 'defer', 'nomodule'].includes(k)) out[k] = true;
    else out[k] = v;
  }
  return out;
}

/**
 * Render operator-supplied head/footer HTML.
 *
 * This deliberately executes whatever the site owner pasted — that is the whole
 * point of a header/footer script box. Only an authenticated admin can write
 * these settings.
 */
export function RawTags({ html, keyPrefix = 't' }: { html: string; keyPrefix?: string }) {
  const tags = parseHeadTags(html);
  if (!tags.length) return null;

  return (
    <>
      {tags.map((tag, i) => {
        const key = `${keyPrefix}-${i}`;
        if (tag.kind === 'meta') return <meta key={key} {...toProps(tag.attrs)} />;
        if (tag.kind === 'link') return <link key={key} {...toProps(tag.attrs)} />;
        if (tag.kind === 'style') {
          return <style key={key} dangerouslySetInnerHTML={{ __html: tag.body }} />;
        }
        const props = toProps(tag.attrs);
        if (props.src) return <script key={key} {...props} async />;
        return <script key={key} {...props} dangerouslySetInnerHTML={{ __html: tag.body }} />;
      })}
    </>
  );
}
