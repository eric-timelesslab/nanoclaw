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
  senderName?: string;
  subject: string;
  body: string;
  timestamp: string;
  rfc2822MessageId: string;
}

export interface ParsedFeedback {
  category: string;
  email: string;
  name: string;
  uuid: string;
  timezone: string;
  appVersion: string;
  coreVersion: string;
  message: string;
}

/**
 * Parse the structured email body format:
 *
 * Bug Reports
 * Email: yaoninja@gmail.com
 * Name: Chuan Yao
 * UUID: 019c924e-...
 * Timezone: America/New_York
 * App Version: 1.8.0
 * Core Version: 1.1.4
 *
 * <free-text message>
 */
// Matches "Key: value" or "* Key: value" where key is word characters + spaces
const FIELD_RE = /^\*?\s*([A-Za-z][A-Za-z ]+?)\s*:\s*(.+)$/;

export function parseFeedbackBody(body: string): ParsedFeedback {
  // Normalize CRLF
  const lines = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const fields: Record<string, string> = {};
  let category = '';
  const messageLines: string[] = [];
  let seenField = false;
  let inMessage = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (i === 0) {
      category = trimmed;
      continue;
    }

    if (inMessage) {
      if (
        trimmed === '--' ||
        trimmed === '-- ' ||
        /^Quick Reply\s/i.test(trimmed)
      ) break;
      messageLines.push(line);
      continue;
    }

    if (trimmed === '') {
      // Only enter message mode after we've seen at least one header field;
      // blank lines before the fields (e.g. between category and fields) are skipped.
      if (seenField) inMessage = true;
      continue;
    }

    const match = trimmed.match(FIELD_RE);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      fields[key] = match[2].trim();
      seenField = true;
    }
  }

  return {
    category,
    email: fields['email'] || '',
    name: fields['name'] || '',
    uuid: fields['uuid'] || '',
    timezone: fields['timezone'] || '',
    appVersion: fields['app_version'] || '',
    coreVersion: fields['core_version'] || '',
    message: messageLines.join('\n').trim(),
  };
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
      category           TEXT,
      name               TEXT,
      uuid               TEXT,
      timezone           TEXT,
      app_version        TEXT,
      core_version       TEXT,
      message            TEXT,
      subject            TEXT,
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

async function generateDraft(
  parsed: ParsedFeedback,
  email: FeedbackEmail,
): Promise<string> {
  const client = process.env.ANTHROPIC_API_KEY
    ? new Anthropic()
    : new Anthropic({ authToken: process.env.CLAUDE_CODE_OAUTH_TOKEN });

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Draft a professional, empathetic reply to this user feedback for Pokr.

Category: ${parsed.category}
From: ${parsed.name} <${parsed.email}>
App Version: ${parsed.appVersion}
Core Version: ${parsed.coreVersion}

Message:
${parsed.message}

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
  const parsed = parseFeedbackBody(email.body);

  await sql`
    INSERT INTO feedback (
      id, thread_id, sender, category, name, uuid, timezone,
      app_version, core_version, message, subject, status, received_at, rfc2822_message_id
    ) VALUES (
      ${email.id}, ${email.threadId}, ${email.sender},
      ${parsed.category}, ${parsed.name}, ${parsed.uuid}, ${parsed.timezone},
      ${parsed.appVersion}, ${parsed.coreVersion}, ${parsed.message},
      ${email.subject}, 'pending', ${email.timestamp}, ${email.rfc2822MessageId}
    )
    ON CONFLICT (id) DO UPDATE SET
      category = EXCLUDED.category,
      name = EXCLUDED.name,
      uuid = EXCLUDED.uuid,
      timezone = EXCLUDED.timezone,
      app_version = EXCLUDED.app_version,
      core_version = EXCLUDED.core_version,
      message = EXCLUDED.message
  `;

  logger.info(
    { id: email.id, category: parsed.category },
    'Feedback stored, generating draft',
  );

  const draft = await generateDraft(parsed, email);

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
      const sender = senderMatch ? senderMatch[2] : from;
      const body = extractTextBody(msg.data.payload);

      if (!body) continue;

      await processAndStoreFeedback({
        id: stub.id,
        threadId,
        sender,
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
