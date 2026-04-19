'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { ValueHistoryRow } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

export function ValueHistoryChart({ points, currency }: { points: ValueHistoryRow[]; currency: string }) {
  const data = points
    .map((p) => ({ date: p.dated_on, value: Number(p.value), source: p.source }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#283d5b" />
          <XAxis dataKey="date" stroke="#9bb6d6" fontSize={11} />
          <YAxis stroke="#9bb6d6" fontSize={11} tickFormatter={(v) => formatCurrency(Number(v), currency)} width={70} />
          <Tooltip
            contentStyle={{ background: '#172033', border: '1px solid #345987', borderRadius: 6 }}
            labelStyle={{ color: '#c7d6e9' }}
            formatter={(v: number) => formatCurrency(v, currency)}
          />
          <Line type="monotone" dataKey="value" stroke="#c9a962" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
