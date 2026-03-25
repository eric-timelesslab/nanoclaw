import { NextRequest, NextResponse } from 'next/server';
import { getEmail, sendReply } from '@/lib/gmail';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { draft } = (await req.json()) as { draft: string };
    if (!draft?.trim()) return NextResponse.json({ error: 'Draft is required' }, { status: 400 });

    const email = await getEmail(id);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await sendReply(email.threadId, email.sender, email.subject, draft, email.rfc2822MessageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
