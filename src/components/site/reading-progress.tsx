'use client';

import { useEffect, useRef } from 'react';

/**
 * Reading progress bar. Written against scroll position with a rAF guard so it
 * never does layout work on the scroll thread, and it renders nothing at all
 * when the reader has asked for reduced motion.
 */
export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.current?.style.setProperty('--p', String(p));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={bar} className="read-progress" aria-hidden />;
}

/**
 * Share links. Uses the native share sheet where the browser has one, and
 * falls back to copying the URL — no third-party scripts, no trackers.
 */
export function ShareBar({ title, url }: { title: string; url: string }) {
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard');
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  const links = [
    { label: 'X', href: `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="eyebrow" style={{ color: 'var(--ink-3)' }}>
        Share
      </span>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target text-sm underline-offset-4 hover:underline"
          style={{ color: 'var(--ink-2)' }}
        >
          {l.label}
        </a>
      ))}
      <button
        type="button"
        onClick={share}
        className="tap-target text-sm underline-offset-4 hover:underline"
        style={{ color: 'var(--ink-2)' }}
      >
        Copy link
      </button>
    </div>
  );
}
