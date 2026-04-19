'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Row {
  id: string;
  name: string;
  description?: string | null;
  parent_id?: string | null;
}

interface Props {
  table: 'locations' | 'collections' | 'tags';
  householdId: string;
  rows: Row[];
  showDescription?: boolean;
  showParent?: boolean;
}

export function SimpleListManager({ table, householdId, rows, showDescription, showParent }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [editing, setEditing] = useState<Record<string, { name: string; description: string; parent_id: string }>>({});
  const supabase = createSupabaseBrowserClient();

  function handleAdd() {
    if (!name.trim()) return;
    const payload: Record<string, unknown> = { household_id: householdId, name: name.trim() };
    if (showDescription) payload.description = description || null;
    if (showParent) payload.parent_id = parentId || null;
    start(async () => {
      const { error } = await supabase.from(table).insert(payload);
      if (!error) {
        setName('');
        setDescription('');
        setParentId('');
        router.refresh();
      } else {
        alert(error.message);
      }
    });
  }

  function handleSave(id: string) {
    const e = editing[id];
    if (!e) return;
    const payload: Record<string, unknown> = { name: e.name };
    if (showDescription) payload.description = e.description || null;
    if (showParent) payload.parent_id = e.parent_id || null;
    start(async () => {
      const { error } = await supabase.from(table).update(payload).eq('id', id);
      if (!error) {
        setEditing((p) => {
          const n = { ...p };
          delete n[id];
          return n;
        });
        router.refresh();
      } else {
        alert(error.message);
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this entry? Items currently using it will be unassigned.')) return;
    start(async () => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (!error) router.refresh();
      else alert(error.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <h2 className="font-medium">Add new</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          {showDescription && (
            <input className="input sm:col-span-2" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
          {showParent && (
            <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">No parent</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>
        <button className="btn-primary" onClick={handleAdd} disabled={pending}>Add</button>
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-brand-300 text-center">None yet.</div>
      ) : (
        <ul className="card divide-y divide-brand-800">
          {rows.map((r) => {
            const e = editing[r.id];
            return (
              <li key={r.id} className="p-3 flex items-center gap-2">
                {e ? (
                  <>
                    <input
                      className="input"
                      value={e.name}
                      onChange={(ev) => setEditing((p) => ({ ...p, [r.id]: { ...e, name: ev.target.value } }))}
                    />
                    {showDescription && (
                      <input
                        className="input"
                        value={e.description}
                        onChange={(ev) => setEditing((p) => ({ ...p, [r.id]: { ...e, description: ev.target.value } }))}
                      />
                    )}
                    {showParent && (
                      <select
                        className="input"
                        value={e.parent_id}
                        onChange={(ev) => setEditing((p) => ({ ...p, [r.id]: { ...e, parent_id: ev.target.value } }))}
                      >
                        <option value="">No parent</option>
                        {rows.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    )}
                    <button className="btn-primary" onClick={() => handleSave(r.id)}>Save</button>
                    <button className="btn-ghost" onClick={() => setEditing((p) => { const n = { ...p }; delete n[r.id]; return n; })}>Cancel</button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="text-sm">{r.name}</div>
                      {showDescription && r.description && (
                        <div className="text-xs text-brand-300">{r.description}</div>
                      )}
                      {showParent && r.parent_id && (
                        <div className="text-xs text-brand-400">in {rows.find((x) => x.id === r.parent_id)?.name ?? 'unknown'}</div>
                      )}
                    </div>
                    <button
                      className="btn-ghost text-sm"
                      onClick={() =>
                        setEditing((p) => ({
                          ...p,
                          [r.id]: { name: r.name, description: r.description ?? '', parent_id: r.parent_id ?? '' },
                        }))
                      }
                    >
                      Edit
                    </button>
                    <button className="btn-ghost text-sm text-red-300" onClick={() => handleDelete(r.id)}>Delete</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
