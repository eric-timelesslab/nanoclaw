import Anthropic from '@anthropic-ai/sdk';
import type { Email } from './gmail';

const client = new Anthropic();

export async function draftReply(email: Email): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are a helpful assistant drafting a reply to app feedback from a user.

From: ${email.senderName} <${email.sender}>
Subject: ${email.subject}

Message:
${email.body}

Write a professional, friendly, and concise reply. Be empathetic and address their feedback directly. Sign off as "The Pokr Team". Output only the email body — no subject line, no extra labels.`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
