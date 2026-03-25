import { google, gmail_v1 } from 'googleapis';

function buildClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Gmail env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN');
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth });
}

export interface Email {
  id: string;
  threadId: string;
  sender: string;
  senderName: string;
  subject: string;
  body: string;
  timestamp: string;
  rfc2822MessageId: string;
}

function extractTextBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
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

export async function listEmails(): Promise<Email[]> {
  const gmail = buildClient();
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'from:feedbacks@pokr.win',
    maxResults: 50,
  });

  const stubs = res.data.messages || [];
  const emails = await Promise.all(stubs.map((s) => getEmail(s.id!)));
  return emails.filter((e): e is Email => e !== null);
}

export async function getEmail(messageId: string): Promise<Email | null> {
  const gmail = buildClient();
  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = msg.data.payload?.headers || [];
  const h = (name: string) =>
    headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || '';

  const from = h('From');
  const subject = h('Subject');
  const rfc2822MessageId = h('Message-ID');
  const threadId = msg.data.threadId || messageId;
  const timestamp = new Date(parseInt(msg.data.internalDate || '0', 10)).toISOString();

  const senderMatch = from.match(/^(.+?)\s*<(.+?)>$/);
  const senderName = senderMatch ? senderMatch[1].replace(/"/g, '') : from;
  const sender = senderMatch ? senderMatch[2] : from;

  const body = extractTextBody(msg.data.payload);

  return { id: messageId, threadId, sender, senderName, subject, body, timestamp, rfc2822MessageId };
}

export async function sendReply(
  threadId: string,
  to: string,
  subject: string,
  body: string,
  inReplyTo: string,
): Promise<void> {
  const gmail = buildClient();
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const fromEmail = profile.data.emailAddress || '';

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const raw = [
    `To: ${to}`,
    `From: ${fromEmail}`,
    `Subject: ${replySubject}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId },
  });
}
