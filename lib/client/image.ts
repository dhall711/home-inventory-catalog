/**
 * Client-side image preprocessing for uploads.
 *
 * Why this exists:
 * - Vercel caps serverless POST bodies at 4.5 MB. Modern iPhone photos
 *   from the Photo Library are routinely 5–12 MB (HEIC, Live Photos,
 *   ProRAW), which makes raw uploads fail with an HTML 413 page that
 *   then breaks JSON parsing on the client.
 * - HEIC/HEIF aren't decoded by `sharp` on the server without a libheif
 *   build, but Safari/iOS can decode them via the browser's native
 *   image pipeline. Re-encoding to JPEG here sidesteps the whole
 *   server-side HEIC mess.
 *
 * Strategy:
 * - Decode the file via createImageBitmap (fast, off-main-thread on
 *   modern browsers). Fall back to an <img> element for browsers where
 *   createImageBitmap can't read HEIC directly.
 * - Auto-orient via the bitmap (createImageBitmap with imageOrientation
 *   "from-image" honors EXIF on browsers that support it; Safari does
 *   so by default).
 * - Resize so the longest side is at most `maxDimension` (default 2000)
 *   — matches what the server then resizes to anyway, so we save
 *   bandwidth without sacrificing fidelity.
 * - Re-encode as JPEG at `quality` (default 0.85).
 * - Skip all of this when the file is already small enough AND in a
 *   server-friendly format, so we don't re-encode iPhone-screenshot
 *   PNGs unnecessarily.
 */
export interface PrepareImageOptions {
  /** Longest-edge cap in pixels. Default 2000. */
  maxDimension?: number;
  /** JPEG quality, 0–1. Default 0.85. */
  quality?: number;
  /** Files smaller than this AND in a known type are passed through unchanged. */
  skipIfSmallerThan?: number;
}

const PASSTHROUGH_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function prepareImageForUpload(
  file: File,
  opts: PrepareImageOptions = {}
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 2000;
  const quality = opts.quality ?? 0.85;
  const skipIfSmallerThan = opts.skipIfSmallerThan ?? 2_500_000;

  if (file.size <= skipIfSmallerThan && PASSTHROUGH_TYPES.has(file.type)) {
    return file;
  }

  const bitmap = await decodeBitmap(file);
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context.');
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    if (!blob) throw new Error('Could not encode image to JPEG.');

    const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    if ('close' in bitmap && typeof bitmap.close === 'function') {
      try { bitmap.close(); } catch { /* noop */ }
    }
  }
}

async function decodeBitmap(file: File): Promise<ImageBitmap> {
  // Preferred: createImageBitmap, which handles JPEG/PNG/WEBP everywhere
  // and HEIC on Safari.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // Fall through to <img> path.
      }
    }
  }

  // Fallback: load via an <img> element, which uses the browser's native
  // image pipeline. On Safari this decodes HEIC; on Chromium/Firefox
  // desktop it will throw for HEIC, which surfaces as a friendly error.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new Error(
            "This image format isn't supported by your browser. Please convert to JPEG or PNG and try again."
          )
        );
      el.src = url;
    });
    if (typeof createImageBitmap === 'function') {
      return await createImageBitmap(img);
    }
    // Last-ditch: synthesize an ImageBitmap-like via canvas. This branch
    // is virtually unreachable in modern browsers but keeps TS happy.
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context.');
    ctx.drawImage(img, 0, 0);
    return canvas as unknown as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Helper for parsing fetch responses that might be HTML error pages
 * (Vercel 413, gateway timeout, etc.) instead of JSON. Returns the
 * parsed JSON body on success or throws a useful Error otherwise.
 */
export async function readJsonOrThrow<T = unknown>(res: Response, fallbackLabel = 'Request'): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    // Try JSON first, fall back to a trimmed text snippet, then a status
    // string. Special-case the common 413 path so the user gets actionable
    // copy instead of a stack trace.
    if (res.status === 413) {
      throw new Error('Image is too large for the server (max ~4.5 MB after compression). Try a smaller photo.');
    }
    try {
      const j = JSON.parse(text) as { error?: string };
      throw new Error(j.error || `${fallbackLabel} failed (${res.status})`);
    } catch (err) {
      if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) {
        throw err;
      }
      const snippet = text.trim().slice(0, 200);
      throw new Error(snippet ? `${fallbackLabel} failed: ${snippet}` : `${fallbackLabel} failed (${res.status})`);
    }
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${fallbackLabel} returned a non-JSON response.`);
  }
}
