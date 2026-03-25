import { listFeedback } from '@/lib/db';
import InboxClient from '@/components/InboxClient';

export const revalidate = 0;

export default async function InboxPage() {
  let rows: Awaited<ReturnType<typeof listFeedback>> = [];
  let error: string | null = null;

  try {
    rows = await listFeedback();
  } catch (err) {
    error = String(err);
  }

  return <InboxClient initialRows={rows} initialError={error} />;
}
