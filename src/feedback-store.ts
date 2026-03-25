import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';

import { logger } from './logger.js';

export interface FeedbackEmail {
  id: string;
  threadId: string;
  sender: string;
  senderName: string;
  subject: string;
  body: string;
  timestamp: string;
  rfc2822MessageId: string;
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return neon(url);
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const sql = db();
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
  schemaReady = true;
}

async function generateDraft(email: FeedbackEmail): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Draft a professional, empathetic reply to this user feedback email for Pokr.

From: ${email.senderName} <${email.sender}>
Subject: ${email.subject}

${email.body}

Sign off as "The Pokr Team". Output only the email body — no subject line, no labels.`,
      },
    ],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function processAndStoreFeedback(email: FeedbackEmail): Promise<void> {
  await ensureSchema();
  const sql = db();

  // Insert email (skip if already stored)
  await sql`
    INSERT INTO feedback (id, thread_id, sender, sender_name, subject, body, status, received_at, rfc2822_message_id)
    VALUES (
      ${email.id}, ${email.threadId}, ${email.sender}, ${email.senderName},
      ${email.subject}, ${email.body}, 'pending', ${email.timestamp}, ${email.rfc2822MessageId}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  logger.info({ id: email.id, subject: email.subject }, 'Feedback stored, generating draft');

  const draft = await generateDraft(email);

  await sql`
    UPDATE feedback SET draft = ${draft}, drafted_at = NOW() WHERE id = ${email.id}
  `;

  logger.info({ id: email.id }, 'Feedback draft stored');
}
