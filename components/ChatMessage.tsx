'use client';

import Link from 'next/link';
import { useState, type ReactNode, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ITEM_LINK_REGEX,
  type ChatActionRow,
  type ChatContentBlock,
  type ChatMessageRow,
  type ChatTextBlock,
  type ChatToolUseBlock,
  type ChatToolResultBlock,
} from '@/lib/chat/types';

interface Props {
  message: ChatMessageRow;
  /** Pending actions for this message (only relevant for assistant rows). */
  actions?: ChatActionRow[];
  /** Renders an action card. Provided by the parent so the panel owns the
   *  approve/reject network calls and refresh logic. */
  renderAction?: (action: ChatActionRow) => ReactNode;
}

/**
 * Convert our custom [[Display Name|item_id]] markup into standard markdown
 * links pointing at /items/<id>. The internal-link Next.js handling happens
 * in the custom `a` renderer below.
 */
function preprocessItemLinks(text: string): string {
  const re = new RegExp(ITEM_LINK_REGEX.source, ITEM_LINK_REGEX.flags);
  return text.replace(re, (_match, label: string, id: string) => {
    const safeLabel = label.replace(/[[\]]/g, '');
    return `[${safeLabel}](/items/${id})`;
  });
}

/**
 * Custom anchor renderer: internal `/items/...` (and other relative) links
 * get a Next.js <Link> for client-side navigation; external links open in a
 * new tab with rel=noreferrer.
 */
function MarkdownLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  const url = href ?? '#';
  const isInternal = url.startsWith('/');
  const className = 'text-brand-300 underline decoration-dotted underline-offset-2 hover:text-brand-100';
  if (isInternal) {
    return (
      <Link href={url} className={className} title="Open item">
        {children}
      </Link>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className={className} {...rest}>
      {children}
    </a>
  );
}

const MARKDOWN_COMPONENTS = {
  a: MarkdownLink,
  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p {...props} className="text-sm leading-relaxed" />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul {...props} className="list-disc pl-5 space-y-1 text-sm" />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol {...props} className="list-decimal pl-5 space-y-1 text-sm" />
  ),
  li: (props: ComponentPropsWithoutRef<'li'>) => (
    <li {...props} className="leading-relaxed" />
  ),
  h1: (props: ComponentPropsWithoutRef<'h1'>) => (
    <h1 {...props} className="text-lg font-semibold mt-2" />
  ),
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2 {...props} className="text-base font-semibold mt-2" />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => (
    <h3 {...props} className="text-sm font-semibold mt-2 text-brand-100" />
  ),
  h4: (props: ComponentPropsWithoutRef<'h4'>) => (
    <h4 {...props} className="text-sm font-semibold mt-2 text-brand-200" />
  ),
  strong: (props: ComponentPropsWithoutRef<'strong'>) => (
    <strong {...props} className="font-semibold text-brand-50" />
  ),
  em: (props: ComponentPropsWithoutRef<'em'>) => (
    <em {...props} className="italic" />
  ),
  hr: (props: ComponentPropsWithoutRef<'hr'>) => (
    <hr {...props} className="my-2 border-brand-800" />
  ),
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      {...props}
      className="border-l-2 border-brand-700 pl-3 text-brand-200 italic"
    />
  ),
  code: ({ className, children, ...rest }: ComponentPropsWithoutRef<'code'>) => {
    // Block-level code (fenced) ships with a language-* className from
    // remark; inline code does not. Style them differently.
    const isBlock = !!className;
    if (isBlock) {
      return (
        <code
          className="block p-2 rounded bg-brand-950/60 border border-brand-800 text-[12px] text-brand-200 overflow-x-auto"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="px-1 py-0.5 rounded bg-brand-950/60 border border-brand-800 text-[12px] text-brand-200"
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: (props: ComponentPropsWithoutRef<'pre'>) => (
    // The <code> child already supplies the styling; pre just provides the
    // block container.
    <pre {...props} className="my-2" />
  ),
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto my-2">
      <table {...props} className="w-full text-xs border border-brand-800" />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<'thead'>) => (
    <thead {...props} className="bg-brand-900/60" />
  ),
  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th {...props} className="text-left px-2 py-1 border border-brand-800 font-semibold" />
  ),
  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td {...props} className="px-2 py-1 border border-brand-800 align-top" />
  ),
};

function TextBlock({ block }: { block: ChatTextBlock }) {
  return (
    <div className="text-sm leading-relaxed space-y-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {preprocessItemLinks(block.text)}
      </ReactMarkdown>
    </div>
  );
}

function ToolUseChip({ block, action }: { block: ChatToolUseBlock; action?: ChatActionRow }) {
  const [open, setOpen] = useState(false);
  const verb = (() => {
    if (!action) return 'Used';
    switch (action.status) {
      case 'proposed': return 'Wants to';
      case 'approved': return 'Approved';
      case 'applied': return 'Applied';
      case 'rejected': return 'Declined';
      case 'failed': return 'Failed to';
      default: return 'Used';
    }
  })();
  const label = `${verb} ${block.name.replace(/_/g, ' ')}`;
  return (
    <div className="text-xs text-brand-400">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:text-brand-200 inline-flex items-center gap-1"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{label}</span>
      </button>
      {open && (
        <pre className="mt-1 p-2 rounded bg-brand-950/60 border border-brand-800 overflow-x-auto text-[11px] text-brand-300">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultChip({ block }: { block: ChatToolResultBlock }) {
  const [open, setOpen] = useState(false);
  // Try to give a richer one-line summary for known shapes.
  let summary = 'tool result';
  try {
    const parsed = JSON.parse(block.content);
    if (parsed && typeof parsed === 'object') {
      if ('total' in parsed && 'items' in parsed) {
        summary = `${parsed.total} item${parsed.total === 1 ? '' : 's'} found`;
      } else if ('total_count' in parsed) {
        summary = `${parsed.total_count} items, $${Number(parsed.total_value || 0).toLocaleString()} total`;
      } else if ('error' in parsed) {
        summary = `error: ${parsed.error}`;
      }
    }
  } catch {
    /* ignore */
  }
  return (
    <div className={`text-xs ${block.is_error ? 'text-red-400' : 'text-brand-500'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:text-brand-200 inline-flex items-center gap-1"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>← {summary}</span>
      </button>
      {open && (
        <pre className="mt-1 p-2 rounded bg-brand-950/60 border border-brand-800 overflow-x-auto text-[11px] text-brand-300 max-h-64">
          {block.content}
        </pre>
      )}
    </div>
  );
}

export function ChatMessageView({ message, actions, renderAction }: Props) {
  const isUser = message.role === 'user';
  const blocks = (message.content_blocks ?? []) as ChatContentBlock[];
  const actionByToolUseId = new Map((actions ?? []).map((a) => [a.tool_use_id, a]));

  // For user messages that are pure tool_result (the agent loop synthesizes
  // these), render only the chips - they're internal plumbing, not real
  // user speech.
  const isInternalToolResults =
    isUser && blocks.length > 0 && blocks.every((b) => b.type === 'tool_result');

  return (
    <div className={`flex ${isUser && !isInternalToolResults ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 space-y-2 ${
          isUser && !isInternalToolResults
            ? 'bg-brand-700 text-white'
            : isInternalToolResults
            ? 'bg-transparent border border-brand-800/40 text-brand-300'
            : 'bg-brand-900/60 border border-brand-800 text-brand-100'
        }`}
      >
        {message.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.image_url}
            alt="attached"
            className="rounded-md max-h-48 object-contain bg-black/20"
          />
        )}
        {blocks.map((b, i) => {
          if (b.type === 'text') return <TextBlock key={i} block={b} />;
          if (b.type === 'image') return null; // already rendered via image_url
          if (b.type === 'tool_use') {
            const action = actionByToolUseId.get(b.id);
            return (
              <div key={i} className="space-y-2">
                <ToolUseChip block={b} action={action} />
                {action && renderAction?.(action)}
              </div>
            );
          }
          if (b.type === 'tool_result') return <ToolResultChip key={i} block={b} />;
          return null;
        })}
      </div>
    </div>
  );
}
