import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES, CATEGORY_ATTRIBUTES, type CategorySlug } from '@/lib/types';

export const anthropic = new Anthropic();

/**
 * Model used for vision + reasoning tasks (item identification, batch
 * detection, value estimation). Defaults to Claude Opus 4.6 for best
 * recognition / reasoning quality. Override at the env layer if you
 * need to fall back to a faster/cheaper model:
 *
 *   ANTHROPIC_MODEL=claude-sonnet-4-5    # cheaper, faster, still strong
 *   ANTHROPIC_MODEL=claude-opus-4-6      # default, best quality
 *
 * Cost note: Opus 4.6 is ~$5/MTok in, ~$25/MTok out — about 5x Sonnet.
 * Most weight goes to image input tokens during batch capture, so plan
 * accordingly if a household uploads thousands of photos at once.
 */
export const VISION_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6';

export function buildItemSchemaPrompt(): string {
  const lines: string[] = [];
  for (const c of CATEGORIES) {
    const fields = CATEGORY_ATTRIBUTES[c.slug];
    if (!fields || fields.length === 0) continue;
    lines.push(`- ${c.slug}: ${fields.map((f) => f.key).join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Cleans up a possibly fenced JSON response from Claude.
 */
export function parseJsonResponse<T>(text: string): T {
  let s = text.trim();
  if (s.startsWith('```json')) s = s.slice(7);
  else if (s.startsWith('```')) s = s.slice(3);
  if (s.endsWith('```')) s = s.slice(0, -3);
  return JSON.parse(s.trim()) as T;
}

export interface ImageInput {
  type: 'image';
  source:
    | { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }
    | { type: 'url'; url: string };
}

export function imageBlockFromUrlOrData(input: { image_url?: string; image_data?: string }): ImageInput {
  if (input.image_url) {
    return { type: 'image', source: { type: 'url', url: input.image_url } };
  }
  if (input.image_data) {
    const m = input.image_data.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error('Invalid image_data data URL');
    const mediaType = m[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: m[2] } };
  }
  throw new Error('image_url or image_data required');
}

export function knownCategorySlugs(): CategorySlug[] {
  return CATEGORIES.map((c) => c.slug);
}

/**
 * Disambiguation hints to steer the AI toward the right category slug
 * when a household includes specialized collections.
 */
export const CATEGORY_GUIDANCE = `Category selection guidance:
- "figurines": small sculptural objects produced as collectibles (Lladró, Hummel, Royal Doulton, anime figures, Precious Moments, bronze maquettes).
- "ethnographic_art": Native American, Pre-Columbian, African, Asian tribal, Aboriginal art and jewelry. Use this for Navajo/Zuni/Hopi silver-and-turquoise pieces, beadwork, kachinas, masks, baskets, weavings.
- "decorative_arts": objet d'art - vases, decorative bowls, paperweights, antique clocks, art glass (Tiffany, Steuben, Baccarat, Murano), porcelain, bronze statuary, antique mirrors.
- "pipes": vintage and estate smoking pipes (Dunhill, Peterson, Castello, meerschaum, briar, clay).
- "musical_instruments": guitars, violins, pianos, brass, etc.
- "coins_currency", "stamps", "firearms", "wine_spirits": numismatic, philatelic, firearms, wine/spirit collections.
- "jewelry": fine jewelry that is NOT ethnographic (modern, designer, fine, costume).
- "art": paintings, prints, drawings, photography, contemporary sculpture (use ethnographic_art for tribal/cultural pieces).
- "collectibles": memorabilia, sports cards, autographs, toys, and anything that doesn't fit a more specific slug above.`;
