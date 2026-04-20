import { NextResponse } from 'next/server';
import { requireHousehold } from '@/lib/household';
import { uploadItemPhoto } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const household = await requireHousehold();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const uploaded = await uploadItemPhoto({
      householdId: household.id,
      buffer: buf,
      filename: file.name,
    });
    return NextResponse.json(uploaded);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
