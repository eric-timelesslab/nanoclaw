import { NextRequest, NextResponse } from 'next/server';
import { getFeedback, markSent } from '@/lib/db';
import { sendReply } from '@/lib/gmail';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { draft } = (await req.json()) as { draft: string };
    if (!draft?.trim()) return NextResponse.json({ error: 'Draft is required' }, { status: 400 });

    const row = await getFeedback(id);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (row.status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 409 });

    await sendReply(
      row.thread_id,
      row.sender,
      row.subject,
      draft,
      row.rfc2822_message_id ?? '',
    );
    await markSent(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
