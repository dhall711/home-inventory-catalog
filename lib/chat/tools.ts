import type { SupabaseClient } from '@supabase/supabase-js';
import { listItems, getItemDetail } from '@/lib/items';
import { CATEGORIES, type CategorySlug, type ItemFilters } from '@/lib/types';
import {
  anthropic,
  buildItemSchemaPrompt,
  CATEGORY_GUIDANCE,
  imageBlockFromUrlOrData,
  knownCategorySlugs,
  parseJsonResponse,
  VISION_MODEL,
} from '@/lib/ai';

/**
 * Context passed to every tool handler. Always scoped to the current
 * household so a tool can never reach across tenants even if the agent
 * tries to specify an item_id from a different household (Postgres RLS
 * also enforces this, but the explicit scoping is belt-and-suspenders).
 */
export interface ToolContext {
  householdId: string;
  userId: string;
  supabase: SupabaseClient;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON schema for the tool input, in the shape Anthropic expects. */
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** True for write-actions that must be confirmed by the user. */
  isWrite: boolean;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);

/**
 * Compact JSON-friendly summary of an item for the agent. We deliberately
 * truncate long fields so 50 search hits stay well under the token budget.
 */
function summarizeItem(it: {
  id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
  current_value: number | null;
  location_id: string | null;
  collection_id: string | null;
  primary_photo_thumb_url: string | null;
  acquired_date: string | null;
  description: string | null;
}) {
  return {
    id: it.id,
    name: it.name,
    category: it.category,
    manufacturer: it.manufacturer,
    model: it.model,
    serial_number: it.serial_number,
    status: it.status,
    current_value: it.current_value,
    location_id: it.location_id,
    collection_id: it.collection_id,
    acquired_date: it.acquired_date,
    description: (it.description ?? '').slice(0, 240) || null,
    photo_thumb: it.primary_photo_thumb_url,
  };
}

// ---------------------------------------------------------------------
// Tool: search_items
// ---------------------------------------------------------------------
const searchItems: ToolDefinition = {
  name: 'search_items',
  description:
    "Search the user's inventory items. Returns the matching items plus a `total` count and a `truncated` flag. " +
    'Combine filters as needed; omit any filter to leave it unconstrained. ' +
    'For free-text use `q`, which matches name, manufacturer, model, serial, and notes. ' +
    'When mentioning items in your reply, use the [[Display Name|item_id]] markup so they render as links.',
  input_schema: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Free-text search across name/manufacturer/model/serial/notes.' },
      categories: {
        type: 'array',
        items: { type: 'string', enum: CATEGORY_SLUGS },
        description: 'Restrict to one or more categories.',
      },
      location_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Restrict to one or more location ids.',
      },
      collection_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Restrict to one or more collection ids.',
      },
      tag_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Restrict to one or more tag ids.',
      },
      status: {
        type: 'string',
        enum: ['active', 'sold', 'disposed', 'lost', 'review'],
      },
      min_value: { type: 'number' },
      max_value: { type: 'number' },
      missing_photo: { type: 'boolean' },
      missing_value: { type: 'boolean' },
      missing_serial: { type: 'boolean' },
      needs_review: { type: 'boolean' },
      limit: { type: 'number', description: 'Max results to return (default 20, hard cap 50).' },
      sort: {
        type: 'string',
        enum: ['updated_desc', 'created_desc', 'name_asc', 'value_desc', 'value_asc', 'acquired_desc'],
      },
    },
  },
  isWrite: false,
  handler: async (input, ctx) => {
    const limit = Math.min(50, Math.max(1, Number(input.limit ?? 20)));
    const filters: ItemFilters = {
      q: input.q as string | undefined,
      categories: input.categories as CategorySlug[] | undefined,
      location_ids: input.location_ids as string[] | undefined,
      collection_ids: input.collection_ids as string[] | undefined,
      tag_ids: input.tag_ids as string[] | undefined,
      status: input.status as ItemFilters['status'],
      min_value: input.min_value as number | undefined,
      max_value: input.max_value as number | undefined,
      missing_photo: input.missing_photo as boolean | undefined,
      missing_value: input.missing_value as boolean | undefined,
      missing_serial: input.missing_serial as boolean | undefined,
      needs_review: input.needs_review as boolean | undefined,
      sort: input.sort as ItemFilters['sort'],
      page: 1,
      page_size: limit,
    };
    // listItems uses a server Supabase client + RLS; household scoping is
    // enforced inside it. We pass householdId explicitly for the where.
    const result = await listItems(ctx.householdId, filters);
    return {
      total: result.total,
      truncated: result.total > result.items.length,
      returned: result.items.length,
      items: result.items.map(summarizeItem),
    };
  },
};

// ---------------------------------------------------------------------
// Tool: get_item
// ---------------------------------------------------------------------
const getItem: ToolDefinition = {
  name: 'get_item',
  description:
    'Fetch full detail for a single item by id: all attributes, photos, value history, and tags. ' +
    'Use this after `search_items` when you need more depth on a particular item.',
  input_schema: {
    type: 'object',
    properties: { item_id: { type: 'string' } },
    required: ['item_id'],
  },
  isWrite: false,
  handler: async (input, ctx) => {
    const itemId = String(input.item_id);
    const detail = await getItemDetail(ctx.householdId, itemId);
    if (!detail) return { error: 'Item not found or not in this household.' };
    return {
      item: summarizeItem(detail.item),
      attributes: detail.attributes,
      tags: detail.tags,
      photos: detail.photos.map((p) => ({ url: p.url, is_primary: p.is_primary })),
      value_history: detail.valueHistory.map((v) => ({
        value: v.value,
        source: v.source,
        dated_on: v.dated_on,
        notes: v.notes,
      })),
    };
  },
};

// ---------------------------------------------------------------------
// Tool: get_stats
// ---------------------------------------------------------------------
const getStats: ToolDefinition = {
  name: 'get_stats',
  description:
    'Inventory statistics: total item count and total value, optionally grouped by category, location, or collection. ' +
    'Use this for portfolio-level questions like "how much is my collection worth?" or "what category is my biggest spend?".',
  input_schema: {
    type: 'object',
    properties: {
      group_by: {
        type: 'string',
        enum: ['category', 'location', 'collection', 'status'],
        description: 'Optional grouping dimension. Omit for a single overall total.',
      },
    },
  },
  isWrite: false,
  handler: async (input, ctx) => {
    const groupBy = input.group_by as 'category' | 'location' | 'collection' | 'status' | undefined;
    const { data: items, error } = await ctx.supabase
      .from('items')
      .select('id, current_value, category, location_id, collection_id, status')
      .eq('household_id', ctx.householdId);
    if (error) return { error: error.message };

    const total_count = items?.length ?? 0;
    const total_value = (items ?? []).reduce((s, it) => s + (Number(it.current_value) || 0), 0);
    const base = { total_count, total_value };

    if (!groupBy) return base;

    const keyOf = (it: (typeof items)[number]): string => {
      switch (groupBy) {
        case 'category': return it.category ?? 'unknown';
        case 'location': return it.location_id ?? 'unassigned';
        case 'collection': return it.collection_id ?? 'unassigned';
        case 'status': return it.status ?? 'unknown';
      }
    };

    const groups = new Map<string, { key: string; count: number; total_value: number }>();
    for (const it of items ?? []) {
      const k = keyOf(it);
      const g = groups.get(k) ?? { key: k, count: 0, total_value: 0 };
      g.count += 1;
      g.total_value += Number(it.current_value) || 0;
      groups.set(k, g);
    }
    return {
      ...base,
      groups: Array.from(groups.values()).sort((a, b) => b.total_value - a.total_value),
    };
  },
};

// ---------------------------------------------------------------------
// Tool: list_collections / list_locations / list_tags
// ---------------------------------------------------------------------
const listCollections: ToolDefinition = {
  name: 'list_collections',
  description: 'List all collections in this household with their ids, names, and default categories.',
  input_schema: { type: 'object', properties: {} },
  isWrite: false,
  handler: async (_input, ctx) => {
    const { data } = await ctx.supabase
      .from('collections')
      .select('id, name, default_category, description')
      .eq('household_id', ctx.householdId)
      .order('name');
    return { collections: data ?? [] };
  },
};

const listLocations: ToolDefinition = {
  name: 'list_locations',
  description: 'List all locations in this household. Locations may be hierarchical via parent_id.',
  input_schema: { type: 'object', properties: {} },
  isWrite: false,
  handler: async (_input, ctx) => {
    const { data } = await ctx.supabase
      .from('locations')
      .select('id, name, parent_id')
      .eq('household_id', ctx.householdId)
      .order('name');
    return { locations: data ?? [] };
  },
};

const listTags: ToolDefinition = {
  name: 'list_tags',
  description: 'List all tags in this household.',
  input_schema: { type: 'object', properties: {} },
  isWrite: false,
  handler: async (_input, ctx) => {
    const { data } = await ctx.supabase
      .from('tags')
      .select('id, name')
      .eq('household_id', ctx.householdId)
      .order('name');
    return { tags: data ?? [] };
  },
};

// ---------------------------------------------------------------------
// Tool: analyze_photo
// Uses the same vision pipeline as /api/analyze-item, but invoked
// directly so the agent can explain the result conversationally.
// Accepts EITHER a public image URL or a base64 data URL.
// ---------------------------------------------------------------------
const analyzePhoto: ToolDefinition = {
  name: 'analyze_photo',
  description:
    'Analyze a photo of an object the user is asking about. Returns the AI-extracted category, name, ' +
    'manufacturer/model if visible, condition, and an estimated current market value. ' +
    'Use this when the user attaches an image asking "what is this?", "what is it worth?", or similar. ' +
    'You can then offer to create_item with the result (in a future write-enabled phase).',
  input_schema: {
    type: 'object',
    properties: {
      image_url: { type: 'string', description: 'Public or signed image URL.' },
      image_data: { type: 'string', description: 'data:image/...;base64,... data URL (alternative to image_url).' },
      hint: { type: 'string', description: 'Optional user-supplied hint about what the object is.' },
    },
  },
  isWrite: false,
  handler: async (input) => {
    let imageBlock;
    try {
      imageBlock = imageBlockFromUrlOrData({
        image_url: input.image_url as string | undefined,
        image_data: input.image_data as string | undefined,
      });
    } catch (e) {
      return { error: (e as Error).message };
    }

    const prompt = `You are an expert appraiser cataloging a household item.
Look at the image and extract everything visible.
Categorize using EXACTLY one of: ${knownCategorySlugs().join(', ')}.

${CATEGORY_GUIDANCE}

Per-category attribute keys you may populate inside "attributes":
${buildItemSchemaPrompt()}

Return ONLY a JSON object with: category, name, description, manufacturer, model, serial_number, condition, estimated_value (USD number), estimated_value_reasoning, confidence (0..1), attributes.

${input.hint ? `User hint: ${input.hint}` : ''}`;

    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: [imageBlock, { type: 'text', text: prompt }] }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { error: 'No text in vision response' };
    }
    try {
      return parseJsonResponse<Record<string, unknown>>(textBlock.text);
    } catch {
      return { error: 'Failed to parse vision JSON', raw: textBlock.text };
    }
  },
};

// =====================================================================
// WRITE TOOLS
// These tools mutate inventory data. They are NOT executed inline by the
// agent loop - the loop persists each invocation as a chat_action with
// status='proposed' and pauses. The user's approve/reject decision drives
// the actual handler call from /api/chat/actions/[id].
//
// Every handler accepts {ctx, input} and returns a JSON-serializable
// summary. We always re-scope the underlying query to .eq('household_id')
// as belt-and-suspenders even though RLS enforces it.
// =====================================================================

const ITEM_STATUSES = ['active', 'sold', 'disposed', 'lost', 'review'];

async function ensureTagIds(
  supabase: SupabaseClient,
  householdId: string,
  tagNames: string[]
): Promise<string[]> {
  const cleanNames = Array.from(
    new Set(tagNames.map((t) => t.trim()).filter(Boolean))
  );
  if (cleanNames.length === 0) return [];
  const { data: existing } = await supabase
    .from('tags')
    .select('id, name')
    .eq('household_id', householdId)
    .in('name', cleanNames);
  const byName = new Map<string, string>((existing ?? []).map((t) => [t.name, t.id]));
  const toCreate = cleanNames.filter((n) => !byName.has(n));
  if (toCreate.length > 0) {
    const { data: created } = await supabase
      .from('tags')
      .insert(toCreate.map((name) => ({ household_id: householdId, name })))
      .select('id, name');
    for (const t of created ?? []) byName.set(t.name, t.id);
  }
  return cleanNames.map((n) => byName.get(n)).filter((id): id is string => !!id);
}

const createItem: ToolDefinition = {
  name: 'create_item',
  description:
    'Create a new inventory item. Use after analyze_photo, or when the user describes an item they want catalogued. ' +
    'Required: name + category. Everything else is optional.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      category: { type: 'string', enum: CATEGORY_SLUGS },
      description: { type: 'string' },
      manufacturer: { type: 'string' },
      model: { type: 'string' },
      serial_number: { type: 'string' },
      condition: { type: 'string', enum: ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'] },
      acquired_date: { type: 'string', description: 'ISO date (YYYY-MM-DD).' },
      acquired_price: { type: 'number' },
      current_value: { type: 'number', description: 'Estimated current market value in USD.' },
      location_id: { type: 'string' },
      collection_id: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tag names to attach.' },
      notes: { type: 'string' },
    },
    required: ['name', 'category'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const tags = (input.tags as string[] | undefined) ?? [];
    const itemFields = { ...input };
    delete (itemFields as Record<string, unknown>).tags;

    const { data: created, error } = await ctx.supabase
      .from('items')
      .insert({ ...itemFields, household_id: ctx.householdId })
      .select('*')
      .single();
    if (error || !created) throw new Error(error?.message ?? 'create failed');

    if (typeof input.current_value === 'number' && (input.current_value as number) > 0) {
      await ctx.supabase.from('value_history').insert({
        item_id: created.id,
        value: input.current_value,
        source: 'ai',
        dated_on: new Date().toISOString().slice(0, 10),
        notes: 'Set during chat creation',
      });
    }

    if (tags.length > 0) {
      const tagIds = await ensureTagIds(ctx.supabase, ctx.householdId, tags);
      if (tagIds.length > 0) {
        await ctx.supabase
          .from('item_tags')
          .insert(tagIds.map((tag_id) => ({ item_id: created.id, tag_id })));
      }
    }

    return { item_id: created.id, name: created.name, summary: `Created [[${created.name}|${created.id}]].` };
  },
};

const updateItem: ToolDefinition = {
  name: 'update_item',
  description:
    'Update one or more fields on an existing item. Only include fields you want to change.',
  input_schema: {
    type: 'object',
    properties: {
      item_id: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      manufacturer: { type: 'string' },
      model: { type: 'string' },
      serial_number: { type: 'string' },
      condition: { type: 'string', enum: ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'] },
      acquired_date: { type: 'string' },
      acquired_price: { type: 'number' },
      current_value: { type: 'number' },
      notes: { type: 'string' },
    },
    required: ['item_id'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const { item_id, ...patch } = input as { item_id: string } & Record<string, unknown>;
    const { data, error } = await ctx.supabase
      .from('items')
      .update(patch)
      .eq('id', item_id)
      .eq('household_id', ctx.householdId)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'item not found');
    return { item_id: data.id, summary: `Updated [[${data.name}|${data.id}]].` };
  },
};

const deleteItem: ToolDefinition = {
  name: 'delete_item',
  description: 'Permanently delete an item. This cannot be undone.',
  input_schema: {
    type: 'object',
    properties: { item_id: { type: 'string' } },
    required: ['item_id'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const itemId = String(input.item_id);
    const { data: existing } = await ctx.supabase
      .from('items')
      .select('name')
      .eq('id', itemId)
      .eq('household_id', ctx.householdId)
      .single();
    const { error } = await ctx.supabase
      .from('items')
      .delete()
      .eq('id', itemId)
      .eq('household_id', ctx.householdId);
    if (error) throw new Error(error.message);
    return { item_id: itemId, summary: `Deleted "${existing?.name ?? itemId}".` };
  },
};

const moveItem: ToolDefinition = {
  name: 'move_item',
  description:
    'Move a single item to a new location and/or collection. Pass an empty string to clear the field. ' +
    'For multi-item moves use bulk_move instead.',
  input_schema: {
    type: 'object',
    properties: {
      item_id: { type: 'string' },
      location_id: { type: 'string', description: 'Location id, or "" to clear.' },
      collection_id: { type: 'string', description: 'Collection id, or "" to clear.' },
    },
    required: ['item_id'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const patch: Record<string, unknown> = {};
    if ('location_id' in input) patch.location_id = (input.location_id as string) || null;
    if ('collection_id' in input) patch.collection_id = (input.collection_id as string) || null;
    const { data, error } = await ctx.supabase
      .from('items')
      .update(patch)
      .eq('id', input.item_id as string)
      .eq('household_id', ctx.householdId)
      .select('id, name')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'item not found');
    return { item_id: data.id, summary: `Moved [[${data.name}|${data.id}]].` };
  },
};

const addTagsTool: ToolDefinition = {
  name: 'add_tags',
  description: 'Add tags (by name) to a single item. Tags are created if they do not exist.',
  input_schema: {
    type: 'object',
    properties: {
      item_id: { type: 'string' },
      tag_names: { type: 'array', items: { type: 'string' } },
    },
    required: ['item_id', 'tag_names'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const itemId = String(input.item_id);
    const names = (input.tag_names as string[]) ?? [];
    const tagIds = await ensureTagIds(ctx.supabase, ctx.householdId, names);
    if (tagIds.length > 0) {
      await ctx.supabase
        .from('item_tags')
        .upsert(
          tagIds.map((tag_id) => ({ item_id: itemId, tag_id })),
          { onConflict: 'item_id,tag_id' }
        );
    }
    return { item_id: itemId, summary: `Added ${tagIds.length} tag(s) to item.` };
  },
};

const removeTagsTool: ToolDefinition = {
  name: 'remove_tags',
  description: 'Remove tags (by name) from a single item.',
  input_schema: {
    type: 'object',
    properties: {
      item_id: { type: 'string' },
      tag_names: { type: 'array', items: { type: 'string' } },
    },
    required: ['item_id', 'tag_names'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const itemId = String(input.item_id);
    const names = ((input.tag_names as string[]) ?? []).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return { item_id: itemId, summary: 'No tags to remove.' };
    const { data: tagRows } = await ctx.supabase
      .from('tags')
      .select('id')
      .eq('household_id', ctx.householdId)
      .in('name', names);
    const ids = (tagRows ?? []).map((t) => t.id);
    if (ids.length > 0) {
      await ctx.supabase.from('item_tags').delete().eq('item_id', itemId).in('tag_id', ids);
    }
    return { item_id: itemId, summary: `Removed ${ids.length} tag(s) from item.` };
  },
};

const changeStatus: ToolDefinition = {
  name: 'change_status',
  description: "Change a single item's status (active, sold, disposed, lost, review).",
  input_schema: {
    type: 'object',
    properties: {
      item_id: { type: 'string' },
      status: { type: 'string', enum: ITEM_STATUSES },
    },
    required: ['item_id', 'status'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const { data, error } = await ctx.supabase
      .from('items')
      .update({ status: input.status })
      .eq('id', input.item_id as string)
      .eq('household_id', ctx.householdId)
      .select('id, name, status')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'item not found');
    return { item_id: data.id, summary: `[[${data.name}|${data.id}]] status -> ${data.status}.` };
  },
};

const bulkMove: ToolDefinition = {
  name: 'bulk_move',
  description: 'Move many items at once to a new location and/or collection. Empty string clears.',
  input_schema: {
    type: 'object',
    properties: {
      item_ids: { type: 'array', items: { type: 'string' } },
      location_id: { type: 'string', description: 'Location id, or "" to clear.' },
      collection_id: { type: 'string', description: 'Collection id, or "" to clear.' },
    },
    required: ['item_ids'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const ids = (input.item_ids as string[]) ?? [];
    if (ids.length === 0) return { summary: 'No items to move.' };
    const patch: Record<string, unknown> = {};
    if ('location_id' in input) patch.location_id = (input.location_id as string) || null;
    if ('collection_id' in input) patch.collection_id = (input.collection_id as string) || null;
    const { error } = await ctx.supabase
      .from('items')
      .update(patch)
      .eq('household_id', ctx.householdId)
      .in('id', ids);
    if (error) throw new Error(error.message);
    return { updated: ids.length, summary: `Moved ${ids.length} items.` };
  },
};

const bulkChangeStatus: ToolDefinition = {
  name: 'bulk_change_status',
  description: 'Change the status of many items at once.',
  input_schema: {
    type: 'object',
    properties: {
      item_ids: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ITEM_STATUSES },
    },
    required: ['item_ids', 'status'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const ids = (input.item_ids as string[]) ?? [];
    if (ids.length === 0) return { summary: 'No items to update.' };
    const { error } = await ctx.supabase
      .from('items')
      .update({ status: input.status })
      .eq('household_id', ctx.householdId)
      .in('id', ids);
    if (error) throw new Error(error.message);
    return { updated: ids.length, summary: `${ids.length} items -> ${input.status}.` };
  },
};

const bulkAddTags: ToolDefinition = {
  name: 'bulk_add_tags',
  description: 'Add the same tags to many items at once.',
  input_schema: {
    type: 'object',
    properties: {
      item_ids: { type: 'array', items: { type: 'string' } },
      tag_names: { type: 'array', items: { type: 'string' } },
    },
    required: ['item_ids', 'tag_names'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const ids = (input.item_ids as string[]) ?? [];
    const names = (input.tag_names as string[]) ?? [];
    if (ids.length === 0 || names.length === 0) return { summary: 'Nothing to do.' };
    const tagIds = await ensureTagIds(ctx.supabase, ctx.householdId, names);

    const { data: validItems } = await ctx.supabase
      .from('items')
      .select('id')
      .eq('household_id', ctx.householdId)
      .in('id', ids);
    const validIds = (validItems ?? []).map((r) => r.id);

    const rows: { item_id: string; tag_id: string }[] = [];
    for (const itemId of validIds) for (const tag_id of tagIds) rows.push({ item_id: itemId, tag_id });
    if (rows.length > 0) {
      await ctx.supabase.from('item_tags').upsert(rows, { onConflict: 'item_id,tag_id' });
    }
    return {
      updated: validIds.length,
      tags_added: tagIds.length,
      summary: `Tagged ${validIds.length} items with ${tagIds.length} tag(s).`,
    };
  },
};

const estimateValueTool: ToolDefinition = {
  name: 'estimate_value',
  description:
    'Use the AI vision/reasoning model to estimate the current market value of an item, ' +
    'using its photos + attributes. Records the estimate in value_history.',
  input_schema: {
    type: 'object',
    properties: { item_id: { type: 'string' } },
    required: ['item_id'],
  },
  isWrite: true,
  handler: async (input, ctx) => {
    const itemId = String(input.item_id);
    const detail = await getItemDetail(ctx.householdId, itemId);
    if (!detail) throw new Error('Item not found');

    const photoUrl = detail.photos.find((p) => p.is_primary)?.url ?? detail.photos[0]?.url;
    const attrSummary = JSON.stringify({
      name: detail.item.name,
      category: detail.item.category,
      manufacturer: detail.item.manufacturer,
      model: detail.item.model,
      condition: detail.item.condition,
      attributes: detail.attributes,
    });

    const userBlocks = [];
    if (photoUrl) {
      userBlocks.push({ type: 'image' as const, source: { type: 'url' as const, url: photoUrl } });
    }
    userBlocks.push({
      type: 'text' as const,
      text:
        `Estimate the current US market value for this item. Be conservative; cite a single number in USD.\n` +
        `Return ONLY JSON: {"estimated_value": number, "reasoning": string}.\n\n` +
        `Item details: ${attrSummary}`,
    });

    const resp = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: userBlocks }],
    });
    const textBlock = resp.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text in response');
    const parsed = parseJsonResponse<{ estimated_value: number; reasoning: string }>(textBlock.text);

    if (typeof parsed.estimated_value === 'number' && parsed.estimated_value > 0) {
      await ctx.supabase.from('value_history').insert({
        item_id: itemId,
        value: parsed.estimated_value,
        source: 'ai',
        dated_on: new Date().toISOString().slice(0, 10),
        notes: parsed.reasoning?.slice(0, 500) ?? 'AI estimate via chat',
      });
      await ctx.supabase
        .from('items')
        .update({
          current_value: parsed.estimated_value,
          current_value_source: 'ai',
        })
        .eq('id', itemId)
        .eq('household_id', ctx.householdId);
    }

    return {
      item_id: itemId,
      estimated_value: parsed.estimated_value,
      reasoning: parsed.reasoning,
      summary: `Estimated [[${detail.item.name}|${itemId}]] at $${Math.round(parsed.estimated_value).toLocaleString()}.`,
    };
  },
};

// ---------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------
export const READ_TOOLS: ToolDefinition[] = [
  searchItems,
  getItem,
  getStats,
  listCollections,
  listLocations,
  listTags,
  analyzePhoto,
];

export const WRITE_TOOLS: ToolDefinition[] = [
  createItem,
  updateItem,
  deleteItem,
  moveItem,
  addTagsTool,
  removeTagsTool,
  changeStatus,
  bulkMove,
  bulkChangeStatus,
  bulkAddTags,
  estimateValueTool,
];

export const ALL_TOOLS: ToolDefinition[] = [...READ_TOOLS, ...WRITE_TOOLS];

export const TOOLS_BY_NAME: Record<string, ToolDefinition> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, t])
);

/**
 * Anthropic API wants tools in `{ name, description, input_schema }` shape.
 * We strip the handler and isWrite flag, both server-side concerns.
 */
export function toolsForApi() {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}
