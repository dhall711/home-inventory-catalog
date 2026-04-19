'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency } from '@/lib/format';

export function CategoryBreakdownChart({
  data,
  currency,
}: {
  data: { category: string; value: number; count: number }[];
  currency: string;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#283d5b" />
          <XAxis dataKey="category" stroke="#9bb6d6" fontSize={11} />
          <YAxis stroke="#9bb6d6" fontSize={11} tickFormatter={(v) => formatCurrency(Number(v), currency)} width={80} />
          <Tooltip
            contentStyle={{ background: '#172033', border: '1px solid #345987', borderRadius: 6 }}
            labelStyle={{ color: '#c7d6e9' }}
            formatter={(v: number, _name, p) => [
              formatCurrency(v, currency),
              `${p.payload.count} items`,
            ]}
          />
          <Bar dataKey="value" fill="#c9a962" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
