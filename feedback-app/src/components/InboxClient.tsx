'use client';

import { useState, useCallback } from 'react';
import type { Email } from '@/lib/gmail';

type EmailSummary = Omit<Email, 'body'>;

interface Props {
  initialEmails: EmailSummary[];
  initialError: string | null;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function InboxClient({ initialEmails, initialError }: Props) {
  const [emails, setEmails] = useState<EmailSummary[]>(initialEmails);
  const [listError, setListError] = useState<string | null>(initialError);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [email, setEmail] = useState<Email | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [draft, setDraft] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [sendDone, setSendDone] = useState(false);

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch('/api/emails');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEmails(data);
    } catch (err) {
      setListError(String(err));
    }
  }, []);

  const selectEmail = useCallback(async (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setEmail(null);
    setDraft('');
    setStatus(null);
    setSendDone(false);
    setLoadingEmail(true);
    try {
      const res = await fetch(`/api/emails/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEmail(data);
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) });
    } finally {
      setLoadingEmail(false);
    }
  }, [selectedId]);

  const generateDraft = useCallback(async () => {
    if (!selectedId) return;
    setGenLoading(true);
    setStatus({ type: 'info', msg: 'Generating draft...' });
    try {
      const res = await fetch(`/api/emails/${selectedId}/draft`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDraft(data.draft);
      setStatus({ type: 'success', msg: 'Draft ready — review and edit before sending.' });
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) });
    } finally {
      setGenLoading(false);
    }
  }, [selectedId]);

  const sendReply = useCallback(async () => {
    if (!selectedId || !draft.trim()) {
      setStatus({ type: 'error', msg: 'Write or generate a reply first.' });
      return;
    }
    if (!confirm('Send this reply?')) return;
    setSendLoading(true);
    try {
      const res = await fetch(`/api/emails/${selectedId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatus({ type: 'success', msg: 'Reply sent!' });
      setSendDone(true);
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) });
    } finally {
      setSendLoading(false);
    }
  }, [selectedId, draft]);

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Feedback Inbox</h1>
          <button className="refresh-btn" onClick={refresh} title="Refresh">↻</button>
        </div>
        <div className="email-list">
          {listError && <div className="empty-list" style={{ color: '#c00' }}>{listError}</div>}
          {!listError && emails.length === 0 && (
            <div className="empty-list">No feedback emails yet</div>
          )}
          {emails.map((e) => (
            <div
              key={e.id}
              className={`email-item${e.id === selectedId ? ' active' : ''}`}
              onClick={() => selectEmail(e.id)}
            >
              <div className="email-item-from">{e.senderName || e.sender}</div>
              <div className="email-item-subject">{e.subject || '(no subject)'}</div>
              <div className="email-item-time">{formatTime(e.timestamp)}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main panel */}
      <main className="main">
        {!selectedId && <div className="empty-main">Select a feedback email to review</div>}

        {selectedId && loadingEmail && (
          <div className="empty-main">Loading...</div>
        )}

        {selectedId && !loadingEmail && email && (
          <>
            {/* Email content */}
            <div className="card">
              <div className="email-subject">{email.subject || '(no subject)'}</div>
              <div className="email-meta-line">
                From: <strong>{email.senderName || email.sender}</strong> &lt;{email.sender}&gt;
              </div>
              <div className="email-meta-line" style={{ color: '#aaa', fontSize: 12 }}>
                {new Date(email.timestamp).toLocaleString()}
              </div>
              <hr className="email-divider" />
              <div className="email-body">{email.body}</div>
            </div>

            {/* Reply */}
            <div className="card">
              <div className="reply-title">Draft Reply</div>
              <div className="reply-top-actions">
                <button
                  className="btn btn-primary"
                  onClick={generateDraft}
                  disabled={genLoading || sendDone}
                >
                  {genLoading ? 'Generating...' : draft ? 'Regenerate' : 'Generate Draft'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setDraft(''); setStatus(null); }}
                  disabled={sendDone}
                >
                  Clear
                </button>
              </div>
              <textarea
                className="draft-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Click 'Generate Draft' or write a reply manually..."
                disabled={sendDone}
              />
              {status && (
                <div className={`status status-${status.type}`}>{status.msg}</div>
              )}
              <div className="reply-bottom-actions">
                <button
                  className="btn btn-success"
                  onClick={sendReply}
                  disabled={sendLoading || sendDone || !draft.trim()}
                >
                  {sendDone ? 'Sent ✓' : sendLoading ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
