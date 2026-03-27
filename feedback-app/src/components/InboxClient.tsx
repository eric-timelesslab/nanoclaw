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

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
    >
      <path d="M4 2.5l4 3.5-4 3.5" />
    </svg>
  );
}

function FeedbackCard({ row }: { row: FeedbackRow }) {
  const [metaOpen, setMetaOpen] = useState(false);
  const catColor = categoryColor(row.category);

  return (
    <div className="card">
      {/* Header: badges + sender email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {row.category && (
          <span style={{
            background: catColor.bg,
            color: catColor.color,
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 99,
            letterSpacing: '0.03em',
          }}>
            {row.category}
          </span>
        )}
        <StatusBadge status={row.status} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#64748b' }}>{row.sender}</span>
      </div>

      {/* Message — hero element */}
      <div style={{
        fontSize: 15,
        lineHeight: 1.8,
        color: '#1e293b',
        whiteSpace: 'pre-wrap',
        marginBottom: 20,
      }}>
        {row.message || '(no message)'}
      </div>

      {/* Collapsible metadata */}
      <button
        onClick={() => setMetaOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: '#94a3b8', padding: '2px 0',
          fontFamily: 'inherit',
        }}
      >
        <IconChevron open={metaOpen} />
        Details
      </button>

      {metaOpen && (
        <div style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '6px 16px',
          fontSize: 12,
          color: '#94a3b8',
        }}>
          {row.name && <><span>Name</span><span style={{ color: '#64748b' }}>{row.name}</span></>}
          {row.app_version && <><span>App</span><span style={{ color: '#64748b' }}>{row.app_version}</span></>}
          {row.core_version && <><span>Core</span><span style={{ color: '#64748b' }}>{row.core_version}</span></>}
          {row.timezone && <><span>Timezone</span><span style={{ color: '#64748b' }}>{row.timezone}</span></>}
          {row.uuid && <><span>UUID</span><span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{row.uuid}</span></>}
          <span>Received</span>
          <span style={{ color: '#64748b' }}>
            {new Date(row.received_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
      )}
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

            {/* Reply card — subdued */}
            <div className="card" style={{ borderColor: '#eef0f5', background: '#fafbfc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Reply
                </span>
                {!selected.draft && (
                  <span style={{ fontSize: 12, color: '#bbb' }}>Andy is drafting...</span>
                )}
                {isDirty && !sendDone && (
                  <span style={{ fontSize: 12, color: '#cbd5e1' }}>Unsaved</span>
                )}
              </div>
              <textarea
                className="draft-textarea"
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                placeholder={selected.draft ? '' : 'Draft will appear here once Andy finishes — refresh to check.'}
                disabled={sendDone}
                style={{ background: sendDone ? '#f8f9fc' : undefined }}
              />
              {status && <div className={`status status-${status.type}`}>{status.msg}</div>}
              <div className="reply-bottom-actions">
                {!sendDone && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => selectedId && saveDraft(selectedId, draft)}
                    disabled={saveLoading || !isDirty}
                  >
                    {saveLoading ? 'Saving...' : 'Save'}
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
