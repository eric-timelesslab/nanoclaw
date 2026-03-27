import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function POST() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      CREATE TABLE IF NOT EXISTS feedback (
        id                 TEXT PRIMARY KEY,
        thread_id          TEXT NOT NULL,
        sender             TEXT NOT NULL,
        sender_name        TEXT NOT NULL,
        subject            TEXT NOT NULL,
        body               TEXT NOT NULL,
        draft              TEXT,
        status             TEXT NOT NULL DEFAULT 'pending',
        received_at        TIMESTAMPTZ NOT NULL,
        drafted_at         TIMESTAMPTZ,
        sent_at            TIMESTAMPTZ,
        rfc2822_message_id TEXT
      )
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
