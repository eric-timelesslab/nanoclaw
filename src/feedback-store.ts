import fs from 'fs';
import os from 'os';
import path from 'path';

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import { google, gmail_v1 } from 'googleapis';

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

export async function processAndStoreFeedback(
  email: FeedbackEmail,
): Promise<void> {
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

  logger.info(
    { id: email.id, subject: email.subject },
    'Feedback stored, generating draft',
  );

  const draft = await generateDraft(email);

  await sql`
    UPDATE feedback SET draft = ${draft}, drafted_at = NOW() WHERE id = ${email.id}
  `;

  logger.info({ id: email.id }, 'Feedback draft stored');
}

function buildGmailClient() {
  const credDir = path.join(os.homedir(), '.gmail-mcp');
  const keys = JSON.parse(
    fs.readFileSync(path.join(credDir, 'gcp-oauth.keys.json'), 'utf-8'),
  );
  const tokens = JSON.parse(
    fs.readFileSync(path.join(credDir, 'credentials.json'), 'utf-8'),
  );
  const cfg = keys.installed || keys.web || keys;
  const auth = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    cfg.redirect_uris?.[0],
  );
  auth.setCredentials(tokens);
  return google.gmail({ version: 'v1', auth });
}

function extractTextBody(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const text = extractTextBody(part);
      if (text) return text;
    }
  }
  return '';
}

export async function syncFeedbackEmails(daysBack = 1): Promise<number> {
  const gmail = buildGmailClient();

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `from:feedbacks@pokr.win newer_than:${daysBack}d`,
    maxResults: 50,
  });

  const stubs = res.data.messages || [];
  if (stubs.length === 0) {
    logger.info({ daysBack }, 'No feedback emails found for sync');
    return 0;
  }

  logger.info({ count: stubs.length, daysBack }, 'Syncing feedback emails');

  let processed = 0;
  for (const stub of stubs) {
    if (!stub.id) continue;
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: stub.id,
        format: 'full',
      });

      const headers = msg.data.payload?.headers || [];
      const h = (name: string) =>
        headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())
          ?.value || '';

      const from = h('From');
      const subject = h('Subject');
      const rfc2822MessageId = h('Message-ID');
      const threadId = msg.data.threadId || stub.id;
      const timestamp = new Date(
        parseInt(msg.data.internalDate || '0', 10),
      ).toISOString();

      const senderMatch = from.match(/^(.+?)\s*<(.+?)>$/);
      const senderName = senderMatch
        ? senderMatch[1].replace(/"/g, '')
        : from;
      const sender = senderMatch ? senderMatch[2] : from;
      const body = extractTextBody(msg.data.payload);

      if (!body) continue;

      await processAndStoreFeedback({
        id: stub.id,
        threadId,
        sender,
        senderName,
        subject,
        body,
        timestamp,
        rfc2822MessageId,
      });
      processed++;
    } catch (err) {
      logger.error({ err, messageId: stub.id }, 'Error syncing feedback email');
    }
  }

  logger.info({ processed, daysBack }, 'Feedback sync complete');
  return processed;
}
