/* ── SkyCare API Client & UI Utilities ── */

const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(url, data) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Request failed'); }
    return res.json();
  },
  async put(url, data) {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Request failed'); }
    return res.json();
  },
  async del(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Request failed'); }
    return res.json();
  }
};

/* ── Toast Notifications ── */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const iconMap = { success: 'checkCircle', error: 'xCircle', info: 'info' };
  toast.innerHTML = `<span class="toast-icon">${Icon(iconMap[type] || 'info', 18)}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3000);
}

/* ── Modal Management ── */
let modalSaveHandler = null;

function openModal(title, bodyHtml, onSave) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('modalFooter').style.display = onSave ? '' : 'none';
  modalSaveHandler = onSave;
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('modalFooter').style.display = '';
  modalSaveHandler = null;
}

function getFormData(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};
  const data = {};
  form.querySelectorAll('[name]').forEach(el => {
    data[el.name] = el.type === 'number' ? (el.value ? Number(el.value) : null) : el.value;
  });
  return data;
}

/* ── Table Builder ── */
function buildTable(columns, rows, actions) {
  if (!rows.length) return `<div class="empty-state"><div class="empty-state-icon">${Icon('clipboard', 42)}</div><p class="empty-state-text">No records found</p></div>`;
  let html = `<div class="table-container"><table class="data-table"><thead><tr>`;
  columns.forEach(c => html += `<th>${c.label}</th>`);
  if (actions) html += `<th>Actions</th>`;
  html += `</tr></thead><tbody>`;
  rows.forEach(row => {
    html += `<tr>`;
    columns.forEach(c => {
      let val = row[c.key] ?? '—';
      if (c.render) val = c.render(row[c.key], row);
      html += `<td>${val}</td>`;
    });
    if (actions) html += `<td><div class="action-btns">${actions(row)}</div></td>`;
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

function badgeHtml(text, type) {
  return `<span class="badge badge-${type}">${text}</span>`;
}

function statusBadge(status) {
  const map = {
    'Active':'success','Available':'success','Scheduled':'info','Paid':'success',
    'Admitted':'warning','Occupied':'danger','On Leave':'warning','Inactive':'default',
    'Discharged':'info','Maintenance':'warning','Completed':'success','Cancelled':'danger',
    'Pending':'warning','Partial':'warning','Overdue':'danger','No Show':'danger',
    'Used':'default','Expired':'danger','Discarded':'danger','Transferred':'info'
  };
  return badgeHtml(status, map[status] || 'default');
}

/* Helper for search box with SVG icon */
function searchBoxHtml(id, placeholder, oninput) {
  return `<div class="search-box"><span class="search-icon">${Icon('search', 15)}</span><input type="text" id="${id}" placeholder="${placeholder}" oninput="${oninput}"></div>`;
}

/* Helper for action buttons with SVG icons */
function editBtn(onclick) { return `<button class="action-btn edit" onclick="${onclick}" title="Edit">${Icon('edit', 14)}</button>`; }
function deleteBtn(onclick) { return `<button class="action-btn delete" onclick="${onclick}" title="Delete">${Icon('trash', 14)}</button>`; }
function viewBtn(onclick, title='View') { return `<button class="action-btn view" onclick="${onclick}" title="${title}">${Icon('eye', 14)}</button>`; }
function scheduleBtn(onclick) { return `<button class="action-btn view" onclick="${onclick}" title="Schedule">${Icon('calendar', 14)}</button>`; }
function dischargeBtn(onclick) { return `<button class="action-btn discharge" onclick="${onclick}" title="Discharge">${Icon('checkCircle', 14)}</button>`; }

/* ── Confirm Dialog ── */
function confirmAction(message) {
  return new Promise(resolve => {
    openModal('Confirm Action', `
      <div style="text-align:center;padding:8px 0;">
        <div style="color:var(--warning);margin-bottom:12px;">${Icon('alertTriangle', 48)}</div>
        <p style="color:var(--text-secondary);margin-bottom:4px;font-size:14px;">${message}</p>
        <p style="color:var(--text-muted);font-size:12px;">This action cannot be undone.</p>
      </div>
      <div class="confirm-actions">
        <button class="btn btn-secondary" onclick="closeModal();window._confirmResolve(false)">Cancel</button>
        <button class="btn btn-danger" onclick="closeModal();window._confirmResolve(true)">${Icon('trash', 14)} Delete</button>
      </div>
    `, null);
    window._confirmResolve = (val) => resolve(val);
  });
}
