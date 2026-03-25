import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.WEBAPP_PORT ? parseInt(process.env.WEBAPP_PORT) : 4000;
const STORE_DIR = path.join(process.cwd(), 'store');
const DB_PATH = path.join(STORE_DIR, 'messages.db');

// --- Gmail client ---

function buildGmailClient(): { gmail: ReturnType<typeof google.gmail>; userEmail: string } | null {
  const credDir = path.join(os.homedir(), '.gmail-mcp');
  const keysPath = path.join(credDir, 'gcp-oauth.keys.json');
  const tokensPath = path.join(credDir, 'credentials.json');
  if (!fs.existsSync(keysPath) || !fs.existsSync(tokensPath)) return null;

  const keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
  const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
  const clientConfig = keys.installed || keys.web || keys;
  const { client_id, client_secret, redirect_uris } = clientConfig;

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
  oauth2Client.setCredentials(tokens);

  // Persist refreshed tokens
  oauth2Client.on('tokens', (newTokens: Record<string, unknown>) => {
    try {
      const current = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
      Object.assign(current, newTokens);
      fs.writeFileSync(tokensPath, JSON.stringify(current, null, 2));
    } catch { /* ignore */ }
  });

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    userEmail: tokens.email || '',
  };
}

// --- DB helpers ---

function openDb(): Database.Database {
  return new Database(DB_PATH, { readonly: true });
}

interface EmailRow {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
}

function getEmails(): EmailRow[] {
  const db = openDb();
  try {
    return db.prepare(`
      SELECT id, chat_jid, sender, sender_name, content, timestamp
      FROM messages
      WHERE chat_jid LIKE 'gmail:%' AND is_from_me = 0 AND is_bot_message = 0
      ORDER BY timestamp DESC
      LIMIT 100
    `).all() as EmailRow[];
  } finally {
    db.close();
  }
}

function getEmail(id: string): EmailRow | undefined {
  const db = openDb();
  try {
    return db.prepare(`
      SELECT id, chat_jid, sender, sender_name, content, timestamp
      FROM messages
      WHERE id = ? AND chat_jid LIKE 'gmail:%'
    `).get(id) as EmailRow | undefined;
  } finally {
    db.close();
  }
}

// Parse the stored email content format: "[Email from Name <email>]\nSubject: ...\n\n<body>"
function parseEmailContent(content: string): { senderLine: string; subject: string; body: string } {
  const lines = content.split('\n');
  const senderLine = lines[0]?.replace(/^\[/, '').replace(/\]$/, '') || '';
  const subjectLine = lines[1] || '';
  const subject = subjectLine.replace(/^Subject:\s*/, '');
  const body = lines.slice(3).join('\n').trim();
  return { senderLine, subject, body };
}

// --- Draft generation ---

async function generateDraft(email: EmailRow): Promise<string> {
  const client = new Anthropic();
  const { senderLine, subject, body } = parseEmailContent(email.content);

  const prompt = `You are a helpful assistant drafting a reply to an app user's feedback email.

From: ${senderLine}
Subject: ${subject}

Email content:
${body}

Write a professional, friendly, and concise reply to this feedback. Be empathetic and helpful. Sign off as "The Team". Only output the email body — no subject line, no "Subject:", no extra formatting.`;

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// --- Gmail send ---

async function sendReply(threadId: string, to: string, subject: string, body: string, replyToMessageId: string): Promise<void> {
  const gmailClient = buildGmailClient();
  if (!gmailClient) throw new Error('Gmail not configured');

  // Re-read credentials to get the user email
  const credDir = path.join(os.homedir(), '.gmail-mcp');
  const tokensPath = path.join(credDir, 'credentials.json');
  const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
  const profileRes = await gmailClient.gmail.users.getProfile({ userId: 'me' });
  const fromEmail = profileRes.data.emailAddress || tokens.email || '';

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const headers = [
    `To: ${to}`,
    `From: ${fromEmail}`,
    `Subject: ${replySubject}`,
    ...(replyToMessageId ? [`In-Reply-To: ${replyToMessageId}`, `References: ${replyToMessageId}`] : []),
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(headers).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await gmailClient.gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId },
  });
}

// --- Express app ---

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// List emails
app.get('/api/emails', (_req, res) => {
  try {
    const emails = getEmails().map((e) => {
      const { senderLine, subject } = parseEmailContent(e.content);
      return {
        id: e.id,
        threadId: e.chat_jid.replace('gmail:', ''),
        sender: e.sender,
        senderName: e.sender_name,
        senderLine,
        subject,
        timestamp: e.timestamp,
      };
    });
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Get single email
app.get('/api/emails/:id', (req, res) => {
  try {
    const email = getEmail(req.params.id);
    if (!email) return res.status(404).json({ error: 'Not found' });
    const { senderLine, subject, body } = parseEmailContent(email.content);
    res.json({
      id: email.id,
      threadId: email.chat_jid.replace('gmail:', ''),
      sender: email.sender,
      senderName: email.sender_name,
      senderLine,
      subject,
      body,
      timestamp: email.timestamp,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Generate draft
app.post('/api/emails/:id/draft', async (req, res) => {
  try {
    const email = getEmail(req.params.id);
    if (!email) return res.status(404).json({ error: 'Not found' });
    const draft = await generateDraft(email);
    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Send reply
app.post('/api/emails/:id/send', async (req, res) => {
  try {
    const { draft } = req.body as { draft: string };
    if (!draft?.trim()) return res.status(400).json({ error: 'Draft is required' });

    const email = getEmail(req.params.id);
    if (!email) return res.status(404).json({ error: 'Not found' });

    const { subject } = parseEmailContent(email.content);
    const threadId = email.chat_jid.replace('gmail:', '');

    await sendReply(threadId, email.sender, subject, draft, '');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Feedback webapp running at http://localhost:${PORT}`);
});
