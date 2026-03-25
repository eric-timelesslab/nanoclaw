import { NextResponse } from 'next/server';
import { listFeedback } from '@/lib/db';

export async function GET() {
  try {
    const rows = await listFeedback();
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
