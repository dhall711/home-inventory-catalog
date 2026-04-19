'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { CATEGORIES, type CategorySlug } from '@/lib/types';

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  default_category: CategorySlug | null;
  cover_photo_url: string | null;
  notes: string | null;
  item_count: number;
  total_value: number;
}

interface Props {
  householdId: string;
  rows: CollectionRow[];
}

export function CollectionsManager({ rows }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultCategory, setDefaultCategory] = useState<CategorySlug | ''>('');
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  function handleAdd() {
    if (!name.trim()) return;
    start(async () => {
      const { error } = await supabase.from('collections').insert({
        name: name.trim(),
        description: description || null,
        default_category: defaultCategory || null,
      });
      if (error) {
        alert(error.message);
        return;
      }
      setName('');
      setDescription('');
      setDefaultCategory('');
      router.refresh();
    });
  }

  function handleSave(id: string) {
    const e = editing[id];
    if (!e) return;
    start(async () => {
      const { error } = await supabase
        .from('collections')
        .update({
          name: e.name,
          description: e.description || null,
          default_category: e.default_category || null,
          notes: e.notes || null,
        })
        .eq('id', id);
      if (error) {
        alert(error.message);
        return;
      }
      setEditing((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this collection? Items in it will be unassigned but kept.')) return;
    start(async () => {
      const { error } = await supabase.from('collections').delete().eq('id', id);
      if (error) alert(error.message);
      else router.refresh();
    });
  }

  async function handleCoverUpload(id: string, file: File) {
    setUploadingFor(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/photo', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      const { error } = await supabase
        .from('collections')
        .update({ cover_photo_url: json.url })
        .eq('id', id);
      if (error) throw error;
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingFor(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <h2 className="font-medium">New collection</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          <input
            className="input"
            placeholder="Name (e.g., Vintage Pipes)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <select
            className="input"
            value={defaultCategory}
            onChange={(e) => setDefaultCategory(e.target.value as CategorySlug | '')}
          >
            <option value="">Default category (optional)</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-brand-300">
          A default category pre-selects the right schema when you add items via the collection.
        </p>
        <button className="btn-primary" onClick={handleAdd} disabled={pending}>
          Add collection
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-brand-300 text-center">
          No collections yet. Create one to group related items like &ldquo;Native American Jewelry&rdquo; or
          &ldquo;Estate Pipes.&rdquo;
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => {
            const e = editing[r.id];
            const isEditing = !!e;
            const categoryLabel = r.default_category
              ? CATEGORIES.find((c) => c.slug === r.default_category)?.name ?? r.default_category
              : null;

            return (
              <li key={r.id} className="card overflow-hidden flex flex-col">
                <div className="aspect-video bg-brand-950/40 relative">
                  {r.cover_photo_url ? (
                    <img src={r.cover_photo_url} alt={r.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm text-brand-400">
                      No cover photo
                    </div>
                  )}
                  <label className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-1 rounded cursor-pointer hover:bg-black/80">
                    {uploadingFor === r.id ? 'Uploading…' : r.cover_photo_url ? 'Replace' : 'Add cover'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingFor === r.id}
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        if (f) handleCoverUpload(r.id, f);
                      }}
                    />
                  </label>
                </div>

                <div className="p-3 flex flex-col gap-2 flex-1">
                  {isEditing ? (
                    <>
                      <input
                        className="input"
                        value={e.name}
                        onChange={(ev) => setEditing((p) => ({ ...p, [r.id]: { ...e, name: ev.target.value } }))}
                      />
                      <input
                        className="input"
                        placeholder="Description"
                        value={e.description}
                        onChange={(ev) =>
                          setEditing((p) => ({ ...p, [r.id]: { ...e, description: ev.target.value } }))
                        }
                      />
                      <select
                        className="input"
                        value={e.default_category}
                        onChange={(ev) =>
                          setEditing((p) => ({
                            ...p,
                            [r.id]: { ...e, default_category: ev.target.value as CategorySlug | '' },
                          }))
                        }
                      >
                        <option value="">No default category</option>
                        {CATEGORIES.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="input min-h-[60px]"
                        placeholder="Notes (provenance, scope, sources…)"
                        value={e.notes}
                        onChange={(ev) => setEditing((p) => ({ ...p, [r.id]: { ...e, notes: ev.target.value } }))}
                      />
                      <div className="flex gap-2">
                        <button className="btn-primary text-sm flex-1" onClick={() => handleSave(r.id)}>
                          Save
                        </button>
                        <button
                          className="btn-ghost text-sm"
                          onClick={() =>
                            setEditing((p) => {
                              const n = { ...p };
                              delete n[r.id];
                              return n;
                            })
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/collections/${r.id}`} className="font-medium hover:text-accent-400">
                          {r.name}
                        </Link>
                        {categoryLabel && (
                          <span className="chip text-[10px]">{categoryLabel}</span>
                        )}
                      </div>
                      {r.description && <div className="text-xs text-brand-300">{r.description}</div>}
                      <div className="text-xs text-brand-400 mt-auto pt-2 flex justify-between">
                        <span>{r.item_count} items</span>
                        <span>${Math.round(r.total_value).toLocaleString()}</span>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/collections/${r.id}`} className="btn-ghost text-xs flex-1 text-center">
                          View
                        </Link>
                        <button
                          className="btn-ghost text-xs"
                          onClick={() =>
                            setEditing((p) => ({
                              ...p,
                              [r.id]: {
                                name: r.name,
                                description: r.description ?? '',
                                default_category: r.default_category ?? '',
                                notes: r.notes ?? '',
                              },
                            }))
                          }
                        >
                          Edit
                        </button>
                        <button className="btn-ghost text-xs text-red-300" onClick={() => handleDelete(r.id)}>
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface EditState {
  name: string;
  description: string;
  default_category: CategorySlug | '';
  notes: string;
}
