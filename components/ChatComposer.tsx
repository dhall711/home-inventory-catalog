'use client';

import { useRef, useState, type FormEvent } from 'react';

interface Props {
  onSend: (args: { message: string; imageData?: string }) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Compress an image client-side before sending so we keep upload size small
 * while keeping enough detail for vision. Same trick as the wine-app chat.
 */
function compressImage(dataUrl: string, maxWidth = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = (h * maxWidth) / w;
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

export function ChatComposer({ onSend, disabled, placeholder }: Props) {
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Image too large. Please use an image under 10MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const original = ev.target?.result as string;
      const compressed = await compressImage(original);
      setPendingImage(compressed);
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || disabled) return;
    if (!text.trim() && !pendingImage) return;
    setBusy(true);
    try {
      await onSend({ message: text.trim(), imageData: pendingImage || undefined });
      setText('');
      setPendingImage('');
    } finally {
      setBusy(false);
    }
  }

  const isDisabled = busy || !!disabled;

  return (
    <form onSubmit={submit} className="border-t border-brand-800 bg-brand-950/40">
      {pendingImage && (
        <div className="px-3 pt-3">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage}
              alt="attached"
              className="h-20 rounded-md border border-brand-700 object-contain bg-black/20"
            />
            <button
              type="button"
              onClick={() => setPendingImage('')}
              className="absolute -top-2 -right-2 bg-brand-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-brand-700"
              aria-label="Remove image"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isDisabled}
          className="px-2 py-2 rounded-md border border-brand-800 text-brand-300 hover:bg-brand-800 disabled:opacity-50"
          title="Attach a photo"
          aria-label="Attach a photo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7h3l2-2h8l2 2h3v13H3z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e as unknown as FormEvent);
            }
          }}
          rows={1}
          disabled={isDisabled}
          placeholder={placeholder ?? 'Ask about your inventory...'}
          className="flex-1 input resize-none max-h-40"
        />
        <button
          type="submit"
          disabled={isDisabled || (!text.trim() && !pendingImage)}
          className="btn-primary px-4 py-2 disabled:opacity-50"
        >
          {busy ? '...' : 'Send'}
        </button>
      </div>
    </form>
  );
}
