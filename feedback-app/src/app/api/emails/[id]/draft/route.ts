import { NextResponse } from 'next/server';
import { getEmail } from '@/lib/gmail';
import { draftReply } from '@/lib/anthropic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const email = await getEmail(id);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const draft = await draftReply(email);
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
