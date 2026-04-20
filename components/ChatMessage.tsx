'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
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
 * Parses [[Display Name|item_id]] markup into clickable Next.js links.
 * Same convention the wine app's chat used.
 */
function parseInlineLinks(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  // Reset regex state - it's a global so prior callers can leave lastIndex set.
  const re = new RegExp(ITEM_LINK_REGEX.source, ITEM_LINK_REGEX.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    const [, label, id] = m;
    out.push(
      <Link
        key={key++}
        href={`/items/${id}`}
        className="text-brand-300 underline decoration-dotted underline-offset-2 hover:text-brand-100"
        title="Open item"
      >
        {label}
      </Link>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out.length > 0 ? out : [text];
}

function TextBlock({ block }: { block: ChatTextBlock }) {
  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{parseInlineLinks(block.text)}</p>;
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
