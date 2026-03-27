'use client';

import { useState, useCallback, useRef } from 'react';
import type { FeedbackRow } from '@/lib/db';

interface Props {
  initialRows: FeedbackRow[];
  initialError: string | null;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function categoryColor(category: string | null): { bg: string; color: string } {
  const c = (category ?? '').toLowerCase();
  if (c.includes('bug')) return { bg: '#fef2f2', color: '#b91c1c' };
  if (c.includes('feature') || c.includes('request')) return { bg: '#eff6ff', color: '#1d4ed8' };
  if (c.includes('feedback') || c.includes('general')) return { bg: '#f0fdf4', color: '#15803d' };
  if (c.includes('question') || c.includes('support')) return { bg: '#fef9c3', color: '#854d0e' };
  return { bg: '#f1f5f9', color: '#475569' };
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    pending: { background: '#fef3c7', color: '#92400e' },
    sent: { background: '#d1fae5', color: '#065f46' },
  };
  const style = styles[status] ?? { background: '#f0f1f5', color: '#555' };
  return (
    <span style={{ ...style, fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
      {status}
    </span>
  );
}

function IconPerson() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="4" width="13" height="9" rx="1.5" />
      <path d="M1.5 5.5 8 9.5l6.5-4" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2c-2 2-2 9 0 12M8 2c2 2 2 9 0 12M2.5 6h11M2.5 10h11" />
    </svg>
  );
}

function IconHash() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 6h10M3 10h10M6 3l-1.5 10M11.5 3 10 13" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5l2.5 1.5" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="1" width="8" height="14" rx="1.5" />
      <circle cx="8" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FeedbackCard({ row }: { row: FeedbackRow }) {
  const catColor = categoryColor(row.category);
  const shortUuid = row.uuid ? row.uuid.slice(0, 8) + '…' : null;

  return (
    <div className="card">
      {/* Category + status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {row.category && (
          <span style={{
            background: catColor.bg,
            color: catColor.color,
            fontSize: 12,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 99,
            letterSpacing: '0.02em',
          }}>
            {row.category}
          </span>
        )}
        <StatusBadge status={row.status} />
      </div>

      {/* Sender */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ color: '#94a3b8' }}><IconPerson /></span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
            {row.name || 'Unknown'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 1 }}>
          <span style={{ color: '#94a3b8' }}><IconMail /></span>
          <span style={{ fontSize: 13, color: '#64748b' }}>{row.sender}</span>
        </div>
      </div>

      {/* Version chips */}
      {(row.app_version || row.core_version) && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {row.app_version && (
            <span className="version-chip">
              <IconPhone />
              App {row.app_version}
            </span>
          )}
          {row.core_version && (
            <span className="version-chip">
              Core {row.core_version}
            </span>
          )}
        </div>
      )}

      {/* Secondary metadata */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        {row.timezone && (
          <span className="meta-chip">
            <IconGlobe />
            {row.timezone}
          </span>
        )}
        {shortUuid && (
          <span className="meta-chip" title={row.uuid ?? ''}>
            <IconHash />
            {shortUuid}
          </span>
        )}
        <span className="meta-chip">
          <IconClock />
          {new Date(row.received_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>

      <hr className="email-divider" />

      {/* Message body */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Message
        </div>
        <div className="email-body">{row.message || '(no message)'}</div>
      </div>
    </div>
  );
}

export default function InboxClient({ initialRows, initialError }: Props) {
  const [rows, setRows] = useState<FeedbackRow[]>(initialRows);
  const [listError, setListError] = useState<string | null>(initialError);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<FeedbackRow | null>(null);
  const [loadingRow, setLoadingRow] = useState(false);
  const [draft, setDraft] = useState('');
  const [savedDraft, setSavedDraft] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [sendDone, setSendDone] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch('/api/emails');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows(data);
    } catch (err) {
      setListError(String(err));
    }
  }, []);

  const selectRow = useCallback(
    async (id: string) => {
      if (id === selectedId) return;
      setSelectedId(id);
      setSelected(null);
      setDraft('');
      setSavedDraft('');
      setStatus(null);
      setSendDone(false);
      setLoadingRow(true);
      try {
        const res = await fetch(`/api/emails/${id}`);
        const data: FeedbackRow = await res.json();
        setSelected(data);
        setDraft(data.draft ?? '');
        setSavedDraft(data.draft ?? '');
        setSendDone(data.status === 'sent');
      } catch (err) {
        setStatus({ type: 'error', msg: String(err) });
      } finally {
        setLoadingRow(false);
      }
    },
    [selectedId],
  );

  const saveDraft = useCallback(async (id: string, text: string) => {
    setSaveLoading(true);
    try {
      const res = await fetch(`/api/emails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedDraft(text);
      setStatus({ type: 'success', msg: 'Draft saved.' });
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) });
    } finally {
      setSaveLoading(false);
    }
  }, []);

  const handleDraftChange = useCallback(
    (text: string) => {
      setDraft(text);
      setStatus(null);
      if (!selectedId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveDraft(selectedId, text), 2000);
    },
    [selectedId, saveDraft],
  );

  const sendReply = useCallback(async () => {
    if (!selectedId || !draft.trim()) {
      setStatus({ type: 'error', msg: 'Draft is empty.' });
      return;
    }
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
      setSavedDraft(draft);
      setRows((prev) =>
        prev.map((r) => (r.id === selectedId ? { ...r, status: 'sent' } : r)),
      );
    } catch (err) {
      setStatus({ type: 'error', msg: String(err) });
    } finally {
      setSendLoading(false);
    }
  }, [selectedId, draft]);

  const isDirty = draft !== savedDraft;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Feedback Inbox</h1>
          <button className="refresh-btn" onClick={refresh} title="Refresh">↻</button>
        </div>
        <div className="email-list">
          {listError && <div className="empty-list" style={{ color: '#c00' }}>{listError}</div>}
          {!listError && rows.length === 0 && <div className="empty-list">No feedback yet</div>}
          {rows.map((r) => (
            <div
              key={r.id}
              className={`email-item${r.id === selectedId ? ' active' : ''}`}
              onClick={() => selectRow(r.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="email-item-from">{r.name || r.sender}</div>
                <StatusBadge status={r.status} />
              </div>
              <div className="email-item-subject">{r.category || r.subject || '(no category)'}</div>
              <div className="email-item-time">{formatTime(r.received_at)}</div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        {!selectedId && <div className="empty-main">Select a feedback email to review</div>}
        {selectedId && loadingRow && <div className="empty-main">Loading...</div>}

        {selectedId && !loadingRow && selected && (
          <>
            <FeedbackCard row={selected} />

            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div className="reply-title" style={{ margin: 0 }}>Draft Reply</div>
                {!selected.draft && (
                  <span style={{ fontSize: 12, color: '#999' }}>Andy is drafting a response...</span>
                )}
                {isDirty && !sendDone && (
                  <span style={{ fontSize: 12, color: '#bbb' }}>Unsaved changes</span>
                )}
              </div>
              <textarea
                className="draft-textarea"
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                placeholder={selected.draft ? '' : 'Draft will appear here once Andy finishes — refresh to check.'}
                disabled={sendDone}
              />
              {status && <div className={`status status-${status.type}`}>{status.msg}</div>}
              <div className="reply-bottom-actions">
                {!sendDone && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => selectedId && saveDraft(selectedId, draft)}
                    disabled={saveLoading || !isDirty}
                  >
                    {saveLoading ? 'Saving...' : 'Save Draft'}
                  </button>
                )}
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
