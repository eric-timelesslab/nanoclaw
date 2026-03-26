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

function MetaField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
      <span style={{ color: '#999', minWidth: 100 }}>{label}</span>
      <span style={{ color: '#333' }}>{value}</span>
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
            <div className="card">
              <div className="email-subject">{selected.category || selected.subject || '(no category)'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0' }}>
                <MetaField label="Name" value={selected.name} />
                <MetaField label="Email" value={selected.sender} />
                <MetaField label="UUID" value={selected.uuid} />
                <MetaField label="Timezone" value={selected.timezone} />
                <MetaField label="App Version" value={selected.app_version} />
                <MetaField label="Core Version" value={selected.core_version} />
                <MetaField label="Received" value={new Date(selected.received_at).toLocaleString()} />
              </div>
              <hr className="email-divider" />
              <div className="email-body">{selected.message || '(no message)'}</div>
            </div>

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
