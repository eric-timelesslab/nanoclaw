import { NextResponse } from 'next/server';
import { getEmail } from '@/lib/gmail';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const email = await getEmail(id);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(email);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
