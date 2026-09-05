'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';

/**
 * WYSIWYG article editor.
 *
 * Markdown stays the canonical format — the SEO analyzer, policy scanner,
 * internal linker and schema builder all read `contentMd`. TipTap edits a rich
 * document and serialises back to Markdown on every change into a hidden
 * textarea, so the surrounding server action is unchanged and nothing
 * downstream has to know an editor exists.
 */

export type MediaItem = { url: string; alt: string };

export function RichEditor({
  name,
  defaultValue,
  media = [],
  onStats,
}: {
  name: string;
  defaultValue: string;
  media?: MediaItem[];
  onStats?: (words: number) => void;
}) {
  const [markdown, setMarkdown] = useState(defaultValue);
  const [mode, setMode] = useState<'rich' | 'markdown'>('rich');

  const editor = useEditor({
    // Rendered on the client only; SSR would produce a mismatched tree.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: { HTMLAttributes: { class: 'rounded bg-slate-900 p-3 text-slate-100' } },
      }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: 'Write the article…' }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ html: false, transformPastedText: true, linkify: true }),
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        class: 'editor-surface',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: e }) => {
      const md = e.storage.markdown.getMarkdown();
      setMarkdown(md);
      onStats?.(countWords(e.getText()));
    },
  });

  // Switching back from raw Markdown re-parses whatever was typed there.
  useEffect(() => {
    if (mode === 'rich' && editor && editor.storage.markdown.getMarkdown() !== markdown) {
      editor.commands.setContent(markdown, false);
    }
  }, [mode, editor, markdown]);

  return (
    <div>
      <div className="editor-shell">
        <Toolbar editor={editor} media={media} mode={mode} onModeChange={setMode} />

        {mode === 'rich' ? (
          <EditorContent editor={editor} />
        ) : (
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={26}
            className="w-full resize-y border-0 bg-white p-4 font-mono text-[13px] leading-relaxed outline-none"
            spellCheck
          />
        )}
      </div>

      {/* The value the server action actually reads. */}
      <textarea name={name} value={markdown} readOnly hidden />
    </div>
  );
}

/* --------------------------------------------------------------- toolbar */

function Toolbar({
  editor,
  media,
  mode,
  onModeChange,
}: {
  editor: Editor | null;
  media: MediaItem[];
  mode: 'rich' | 'markdown';
  onModeChange: (m: 'rich' | 'markdown') => void;
}) {
  const [showImages, setShowImages] = useState(false);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (leave empty to remove)', previous || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const insertImage = useCallback(
    (url: string, alt: string) => {
      if (!editor || !url) return;
      editor.chain().focus().setImage({ src: url, alt }).run();
      setShowImages(false);
    },
    [editor],
  );

  const promptImage = useCallback(() => {
    const url = window.prompt('Image URL');
    if (!url) return;
    const alt = window.prompt('Alt text — describe the image for screen readers') || '';
    insertImage(url, alt);
  }, [insertImage]);

  const disabled = mode !== 'rich' || !editor;

  return (
    <div className="editor-toolbar">
      <Group>
        <Btn label="Paragraph" title="Body text" active={editor?.isActive('paragraph')} disabled={disabled}
          onClick={() => editor?.chain().focus().setParagraph().run()}>
          ¶
        </Btn>
        {[2, 3, 4].map((level) => (
          <Btn
            key={level}
            label={`Heading ${level}`}
            title={`Heading ${level}`}
            active={editor?.isActive('heading', { level })}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: level as 2 | 3 | 4 }).run()}
          >
            H{level}
          </Btn>
        ))}
      </Group>

      <Group>
        <Btn label="Bold" title="Bold" active={editor?.isActive('bold')} disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}>
          <b>B</b>
        </Btn>
        <Btn label="Italic" title="Italic" active={editor?.isActive('italic')} disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </Btn>
        <Btn label="Strikethrough" title="Strikethrough" active={editor?.isActive('strike')} disabled={disabled}
          onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </Btn>
        <Btn label="Inline code" title="Inline code" active={editor?.isActive('code')} disabled={disabled}
          onClick={() => editor?.chain().focus().toggleCode().run()}>
          {'</>'}
        </Btn>
      </Group>

      <Group>
        <Btn label="Bulleted list" title="Bulleted list" active={editor?.isActive('bulletList')} disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          ••
        </Btn>
        <Btn label="Numbered list" title="Numbered list" active={editor?.isActive('orderedList')} disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          1.
        </Btn>
        <Btn label="Quote" title="Pull quote" active={editor?.isActive('blockquote')} disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          &ldquo;
        </Btn>
        <Btn label="Divider" title="Horizontal rule" disabled={disabled}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
          —
        </Btn>
      </Group>

      <Group>
        <Btn label="Link" title="Add or edit a link" active={editor?.isActive('link')} disabled={disabled} onClick={setLink}>
          ⛓
        </Btn>
        <Btn label="Insert image" title="Insert an image" disabled={disabled} onClick={() => setShowImages((v) => !v)}>
          ▣
        </Btn>
        <Btn
          label="Insert table"
          title="Insert a 3×3 table"
          disabled={disabled}
          onClick={() =>
            editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          ▦
        </Btn>
      </Group>

      <Group>
        <Btn label="Undo" title="Undo" disabled={disabled} onClick={() => editor?.chain().focus().undo().run()}>
          ↶
        </Btn>
        <Btn label="Redo" title="Redo" disabled={disabled} onClick={() => editor?.chain().focus().redo().run()}>
          ↷
        </Btn>
      </Group>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => onModeChange(mode === 'rich' ? 'markdown' : 'rich')}
          className="rounded px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          title="Switch between the visual editor and raw Markdown"
        >
          {mode === 'rich' ? 'Markdown' : 'Visual'}
        </button>
      </div>

      {showImages && (
        <div className="editor-imagepicker">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Insert an image</p>
            <button type="button" onClick={promptImage} className="btn btn-ghost btn-sm">
              From a URL…
            </button>
          </div>
          {media.length === 0 ? (
            <p className="text-xs text-slate-500">
              No images generated for this article yet. Use &ldquo;From a URL&rdquo; to add one.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {media.map((m) => (
                <button
                  key={m.url}
                  type="button"
                  onClick={() => insertImage(m.url, m.alt)}
                  className="group overflow-hidden rounded border border-slate-200 hover:border-blue-500"
                  title={m.alt || m.url}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="aspect-[16/10] w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5 last:border-r-0">{children}</div>;
}

function Btn({
  children,
  label,
  title,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-pressed={!!active}
      className={`grid h-8 min-w-8 place-items-center rounded px-1.5 text-xs transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) || []).length;
}
