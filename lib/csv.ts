export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const r of rows) lines.push(r.map(escape).join(','));
  return lines.join('\n');
}
