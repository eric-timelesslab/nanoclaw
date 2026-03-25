import { NextResponse } from 'next/server';
import { listEmails } from '@/lib/gmail';

export async function GET() {
  try {
    const emails = await listEmails();
    // Don't send body in the list — keep it light
    const summary = emails.map(({ body: _body, ...rest }) => rest);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
