let emails = [];
let selectedId = null;

async function loadEmails() {
  const list = document.getElementById('email-list');
  list.innerHTML = '<div style="padding:16px;color:#aaa;font-size:13px">Loading...</div>';
  try {
    const res = await fetch('/api/emails');
    emails = await res.json();
    renderList();
  } catch (e) {
    list.innerHTML = `<div style="padding:16px;color:#c00;font-size:13px">Failed to load: ${e.message}</div>`;
  }
}

function renderList() {
  const list = document.getElementById('email-list');
  if (!emails.length) {
    list.innerHTML = '<div style="padding:20px;color:#aaa;font-size:13px;text-align:center">No feedback emails yet</div>';
    return;
  }
  list.innerHTML = emails.map(e => `
    <div class="email-item ${e.id === selectedId ? 'active' : ''}" data-id="${e.id}">
      <div class="email-item-from">${esc(e.senderName || e.sender)}</div>
      <div class="email-item-subject">${esc(e.subject || '(no subject)')}</div>
      <div class="email-item-time">${formatTime(e.timestamp)}</div>
    </div>
  `).join('');
  list.querySelectorAll('.email-item').forEach(el => {
    el.addEventListener('click', () => selectEmail(el.dataset.id));
  });
}

async function selectEmail(id) {
  selectedId = id;
  renderList();

  const main = document.getElementById('main-panel');
  main.innerHTML = '<div style="margin:auto;color:#aaa;font-size:14px">Loading...</div>';
  main.style.display = 'flex';

  try {
    const res = await fetch(`/api/emails/${id}`);
    const email = await res.json();
    renderEmailDetail(email);
  } catch (e) {
    main.innerHTML = `<div style="margin:auto;color:#c00">Error: ${e.message}</div>`;
  }
}

function renderEmailDetail(email) {
  const main = document.getElementById('main-panel');
  main.style.display = '';
  main.innerHTML = `
    <div class="email-card">
      <div class="email-meta">
        <div class="email-subject">${esc(email.subject || '(no subject)')}</div>
        <div class="email-from">From: <strong>${esc(email.senderName || email.sender)}</strong> &lt;${esc(email.sender)}&gt;</div>
        <div class="email-time">${formatTime(email.timestamp)}</div>
      </div>
      <div class="email-body">${esc(email.body)}</div>
    </div>

    <div class="reply-card">
      <h2>Draft Reply</h2>
      <div class="reply-actions-top">
        <button class="btn-primary" id="gen-btn" onclick="generateDraft('${email.id}')">
          Generate Draft
        </button>
        <button class="btn-secondary" id="clear-btn" onclick="clearDraft()">Clear</button>
      </div>
      <textarea id="draft-area" placeholder="Click 'Generate Draft' to have Andy draft a reply, or write one manually..."></textarea>
      <div id="draft-status"></div>
      <div class="reply-actions-bottom">
        <button class="btn-success" id="send-btn" onclick="sendReply('${email.id}')">
          Send Reply
        </button>
      </div>
    </div>
  `;
}

async function generateDraft(id) {
  const btn = document.getElementById('gen-btn');
  const area = document.getElementById('draft-area');
  const status = document.getElementById('draft-status');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Generating...';
  setStatus('info', 'Andy is drafting a response...');

  try {
    const res = await fetch(`/api/emails/${id}/draft`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    area.value = data.draft;
    setStatus('success', 'Draft generated — review and edit before sending.');
  } catch (e) {
    setStatus('error', `Failed to generate draft: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Regenerate Draft';
  }
}

function clearDraft() {
  const area = document.getElementById('draft-area');
  if (area) { area.value = ''; area.focus(); }
  setStatus('', '');
}

async function sendReply(id) {
  const area = document.getElementById('draft-area');
  const btn = document.getElementById('send-btn');
  const draft = area?.value?.trim();

  if (!draft) {
    setStatus('error', 'Please write or generate a reply first.');
    return;
  }

  if (!confirm('Send this reply?')) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Sending...';

  try {
    const res = await fetch(`/api/emails/${id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setStatus('success', 'Reply sent successfully!');
    btn.innerHTML = 'Sent ✓';
  } catch (e) {
    setStatus('error', `Failed to send: ${e.message}`);
    btn.disabled = false;
    btn.innerHTML = 'Send Reply';
  }
}

function setStatus(type, msg) {
  const el = document.getElementById('draft-status');
  if (!el) return;
  el.className = type ? `status ${type}` : '';
  el.textContent = msg;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.getElementById('refresh-btn').addEventListener('click', loadEmails);
loadEmails();
