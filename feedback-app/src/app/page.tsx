import { listEmails } from '@/lib/gmail';
import InboxClient from '@/components/InboxClient';

export const revalidate = 0;

export default async function InboxPage() {
  let emails: Awaited<ReturnType<typeof listEmails>> = [];
  let error: string | null = null;

  try {
    emails = await listEmails();
  } catch (err) {
    error = String(err);
  }

  return <InboxClient initialEmails={emails} initialError={error} />;
}
