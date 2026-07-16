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

function moduleCanRead(module) {
  try {
    return typeof Auth !== 'undefined' && Auth.canRead(module);
  } catch (_) {
    return false;
  }
}

function moduleCanWrite(module) {
  try {
    return typeof Auth !== 'undefined' && Auth.canWrite(module);
  } catch (_) {
    return false;
  }
}

function ifCanWrite(module, html) {
  return moduleCanWrite(module) ? html : '';
}

function reportBtn(onclick, label = 'Report PDF') {
  return `<button class="btn btn-secondary" onclick="${onclick}">${Icon('fileText', 14)} ${label}</button>`;
}

/* Helper for search box with SVG icon */
function searchBoxHtml(id, placeholder, oninput) {
  return `<div class="search-box"><span class="search-icon">${Icon('search', 15)}</span><input type="text" id="${id}" placeholder="${placeholder}" oninput="${oninput}"></div>`;
}

/* Helper for action buttons with SVG icons */
function editBtn(onclick) { return `<button class="action-btn edit" onclick="${onclick}" title="Edit">${Icon('edit', 14)}</button>`; }
function passwordBtn(onclick) { return `<button class="action-btn edit" onclick="${onclick}" title="Change Password" style="background:var(--warning-light);color:var(--warning)">${Icon('key', 14)}</button>`; }
function deleteBtn(onclick) { return `<button class="action-btn delete" onclick="${onclick}" title="Delete">${Icon('trash', 14)}</button>`; }
function viewBtn(onclick, title='View') { return `<button class="action-btn view" onclick="${onclick}" title="${title}">${Icon('eye', 14)}</button>`; }
function scheduleBtn(onclick) { return `<button class="action-btn view" onclick="${onclick}" title="Schedule">${Icon('calendar', 14)}</button>`; }
function dischargeBtn(onclick) { return `<button class="action-btn discharge" onclick="${onclick}" title="Discharge">${Icon('checkCircle', 14)}</button>`; }
function invoiceBtn(onclick) { return `<button class="action-btn invoice" onclick="${onclick}" title="Invoice PDF">${Icon('fileText', 14)}</button>`; }

/* ── PDF Utilities ── */
function getPdfFactory() {
  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    showToast('PDF generator is not loaded. Please refresh and try again.', 'error');
    return null;
  }
  return window.jspdf.jsPDF;
}

function toPdfText(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function asCurrency(value) {
  const amount = Number(value || 0);
  return `BDT ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function downloadReportPdf({ title, subtitle, filename, columns, rows, meta = [] }) {
  const jsPDF = getPdfFactory();
  if (!jsPDF) return;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  if (typeof doc.autoTable !== 'function') {
    showToast('PDF table module is missing. Please refresh and try again.', 'error');
    return;
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const user = Auth && Auth.getUser ? Auth.getUser() : null;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 86, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SkyCare Hospital Management System', 36, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(title || 'Report', 36, 58);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(10);
  let infoY = 108;
  if (subtitle) {
    doc.text(subtitle, 36, infoY);
    infoY += 14;
  }

  doc.text(`Generated: ${new Date().toLocaleString()}`, 36, infoY);
  infoY += 14;
  if (user) {
    doc.text(`Generated by: ${(user.full_name || user.username)} (${user.role || 'User'})`, 36, infoY);
    infoY += 14;
  }

  meta.forEach((item) => {
    doc.text(`${item.label}: ${toPdfText(item.value)}`, 36, infoY);
    infoY += 14;
  });

  const head = [(columns || []).map((c) => c.label)];
  const bodyRows = (rows || []).map((row) => (columns || []).map((c) => {
    if (typeof c.pdfRender === 'function') return toPdfText(c.pdfRender(row[c.key], row));
    return toPdfText(row[c.key]);
  }));

  const body = bodyRows.length
    ? bodyRows
    : [[(columns && columns[0] ? 'No records found' : 'No data'), ...((columns || []).slice(1).map(() => ''))]];

  doc.autoTable({
    startY: infoY + 10,
    head,
    body,
    margin: { left: 36, right: 36, bottom: 34 },
    styles: { fontSize: 9, cellPadding: 6, textColor: [15, 23, 42] },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: (data) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text('Confidential - SkyCare HMS', 36, pageHeight - 16);
      doc.text(`Page ${data.pageNumber}`, pageWidth - 70, pageHeight - 16);
    }
  });

  const safeFile = filename || `${(title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
  doc.save(safeFile);
}

function downloadBillingInvoicePdf(invoice) {
  if (!invoice) {
    showToast('Invoice data not found', 'error');
    return;
  }

  const jsPDF = getPdfFactory();
  if (!jsPDF) return;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  if (typeof doc.autoTable !== 'function') {
    showToast('PDF table module is missing. Please refresh and try again.', 'error');
    return;
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const total = Number(invoice.total_amount || 0);
  const paid = Number(invoice.paid_amount || 0);
  const due = Math.max(total - paid, 0);

  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageWidth, 108, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('SkyCare HMS', 36, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Hospital Management System', 36, 56);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('INVOICE', pageWidth - 118, 42);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Invoice No: INV-${invoice.id}`, 36, 136);
  doc.text(`Date: ${toPdfText((invoice.billing_date || '').split('T')[0] || new Date().toISOString().split('T')[0])}`, 36, 152);
  doc.text(`Status: ${toPdfText(invoice.status)}`, 36, 168);
  doc.text(`Payment Method: ${toPdfText(invoice.payment_method)}`, 36, 184);

  doc.setFont('helvetica', 'bold');
  doc.text('Bill To', 36, 214);
  doc.setFont('helvetica', 'normal');
  doc.text(toPdfText(invoice.patient_name), 36, 230);

  doc.autoTable({
    startY: 252,
    head: [['Description', 'Amount']],
    body: [[toPdfText(invoice.description || 'Hospital Services'), asCurrency(total)]],
    margin: { left: 36, right: 36 },
    styles: { fontSize: 10, cellPadding: 8, textColor: [15, 23, 42] },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } }
  });

  const summaryTop = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 320) + 16;
  const boxX = pageWidth - 240;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(boxX, summaryTop, 204, 94, 8, 8, 'F');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Total Amount', boxX + 12, summaryTop + 24);
  doc.text('Paid Amount', boxX + 12, summaryTop + 46);
  doc.text('Amount Due', boxX + 12, summaryTop + 68);

  doc.setTextColor(15, 23, 42);
  doc.text(asCurrency(total), boxX + 192, summaryTop + 24, { align: 'right' });
  doc.text(asCurrency(paid), boxX + 192, summaryTop + 46, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(asCurrency(due), boxX + 192, summaryTop + 68, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('This is a computer-generated invoice and does not require a physical signature.', 36, pageHeight - 46);
  doc.text('Authorized Signature _____________________', pageWidth - 260, pageHeight - 28);

  doc.save(`invoice-${invoice.id}.pdf`);
}

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
