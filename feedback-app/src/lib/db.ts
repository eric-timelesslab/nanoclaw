import { neon } from '@neondatabase/serverless';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return neon(url);
}

export interface FeedbackRow {
  id: string;
  thread_id: string;
  sender: string;
  sender_name: string;
  subject: string;
  body: string;
  draft: string | null;
  status: string;
  received_at: string;
  drafted_at: string | null;
  sent_at: string | null;
  rfc2822_message_id: string | null;
}

export async function listFeedback(): Promise<FeedbackRow[]> {
  const db = sql();
  return (await db`
    SELECT * FROM feedback ORDER BY received_at DESC LIMIT 100
  `) as FeedbackRow[];
}

export async function getFeedback(id: string): Promise<FeedbackRow | null> {
  const db = sql();
  const rows = (await db`
    SELECT * FROM feedback WHERE id = ${id}
  `) as FeedbackRow[];
  return rows[0] ?? null;
}

export async function markSent(id: string): Promise<void> {
  const db = sql();
  await db`
    UPDATE feedback SET status = 'sent', sent_at = NOW() WHERE id = ${id}
  `;
}
