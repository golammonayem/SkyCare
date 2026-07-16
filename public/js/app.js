/* ── SkyCare — Main Application Entry ── */

const PAGE_RENDERERS = {
  'dashboard': renderDashboard, 'departments': renderDepartments,
  'doctors': renderDoctors, 'patients': renderPatients, 'rooms': renderRooms,
  'admissions': renderAdmissions, 'medical-records': renderMedicalRecords,
  'appointments': renderAppointments, 'billing': renderBilling,
  'staff': renderStaff, 'blood-bank': renderBloodBank,
  'users': renderUsers, 'audit-log': renderAuditLog,
};

const PAGE_TITLES = {
  'dashboard':'Dashboard','departments':'Departments','doctors':'Doctors',
  'patients':'Patients','rooms':'Rooms','admissions':'Admissions',
  'medical-records':'Medical Records','appointments':'Appointments',
  'billing':'Billing','staff':'Staff & Duties','blood-bank':'Blood Bank',
  'users':'User Management','audit-log':'Activity Log',
};

const PAGE_MODULE_MAP = {
  'dashboard':'dashboard','departments':'departments','doctors':'doctors',
  'patients':'patients','rooms':'rooms','admissions':'admissions',
  'medical-records':'medical-records','appointments':'appointments',
  'billing':'billing','staff':'staff','blood-bank':'blood-donations',
  'users':'users','audit-log':'audit-log',
};

let currentPage = 'dashboard';

/* ── Router ── */
function navigate(page) {
  const module = PAGE_MODULE_MAP[page];
  if (module && !Auth.canRead(module)) {
    document.getElementById('pageTitle').textContent = 'Access Denied';
    document.getElementById('pageContent').innerHTML = `
      <div class="access-denied">
        <div class="access-denied-icon">${Icon('shield', 56)}</div>
        <h3 class="access-denied-title">Access Denied</h3>
        <p class="access-denied-text">Your role (${Auth.getRole()}) does not have permission to access this module.</p>
      </div>`;
    return;
  }
  currentPage = page;
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));

  const content = document.getElementById('pageContent');
  content.style.opacity = '0'; content.style.transform = 'translateY(6px)';
  setTimeout(() => {
    content.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Loading...</p></div>`;
    content.style.opacity = '1'; content.style.transform = 'translateY(0)';
    const renderer = PAGE_RENDERERS[page];
    if (renderer) renderer();
    else content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon('fileText', 48)}</div><p class="empty-state-text">Page not found</p></div>`;
  }, 120);
  closeMobileSidebar();
}

function handleHashChange() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigate(hash);
}

function refreshCurrentData() {
  const renderer = PAGE_RENDERERS[currentPage];
  if (renderer) {
    const btn = document.getElementById('globalRefreshBtn');
    if (btn) {
      btn.style.animation = 'spin 1s linear infinite';
      setTimeout(() => { btn.style.animation = ''; }, 1000);
    }
    renderer();
    showToast('Data refreshed successfully', 'success');
  }
}

let _searchTimer = null;
function handleGlobalSearch(val) {
  clearTimeout(_searchTimer);
  const box = document.getElementById('globalSearchResults');
  if (!val || val.length < 2) { box.classList.remove('active'); return; }
  _searchTimer = setTimeout(async () => {
    try {
      const results = await API.get(`/api/global-search?q=${encodeURIComponent(val)}`);
      if (!results.length) {
        box.innerHTML = '<div class="gsr-empty">No results found</div>';
      } else {
        box.innerHTML = results.map(r => {
          const initials = (r.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
          return `<div class="gsr-item" onclick="showPersonProfile('${r.type}', ${r.id})">
            <div class="gsr-avatar ${r.type}">${initials}</div>
            <div class="gsr-info">
              <div class="gsr-name">${r.name}</div>
              <div class="gsr-detail">${r.detail || ''} ${r.phone ? '• '+r.phone : ''} ${r.email ? '• '+r.email : ''}</div>
            </div>
            <span class="gsr-type ${r.type}">${r.type}</span>
          </div>`;
        }).join('');
      }
      box.classList.add('active');
    } catch(e) { box.classList.remove('active'); }
  }, 300);
}

async function showPersonProfile(type, id) {
  document.getElementById('globalSearchResults').classList.remove('active');
  document.getElementById('globalSearchInput').value = '';
  try {
    let data, title, html;
    if (type === 'doctor') {
      data = await API.get(`/api/doctors/${id}`);
      title = data.name;
      html = `<div style="text-align:center;margin-bottom:16px;"><div style="width:64px;height:64px;border-radius:50%;background:var(--accent-gradient);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:22px;font-weight:700;">${(data.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}</div><h3 style="margin:0;">${data.name}</h3><p style="color:var(--text-muted);font-size:12px;margin-top:2px;">${data.specialization || 'Doctor'}</p></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Phone</label><div class="form-control" style="background:var(--bg-body);">${data.phone||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Email</label><div class="form-control" style="background:var(--bg-body);">${data.email||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Department</label><div class="form-control" style="background:var(--bg-body);">${data.department_name||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Experience</label><div class="form-control" style="background:var(--bg-body);">${data.experience_years ? data.experience_years+' years':'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Qualification</label><div class="form-control" style="background:var(--bg-body);">${data.qualification||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Status</label><div class="form-control" style="background:var(--bg-body);">${data.status||'N/A'}</div></div>
        </div>`;
    } else if (type === 'patient') {
      data = await API.get(`/api/patients/${id}`);
      title = data.name;
      html = `<div style="text-align:center;margin-bottom:16px;"><div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#059669,#10B981);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:22px;font-weight:700;">${(data.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}</div><h3 style="margin:0;">${data.name}</h3><p style="color:var(--text-muted);font-size:12px;margin-top:2px;">Patient</p></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Phone</label><div class="form-control" style="background:var(--bg-body);">${data.phone||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Email</label><div class="form-control" style="background:var(--bg-body);">${data.email||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Gender</label><div class="form-control" style="background:var(--bg-body);">${data.gender||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Blood Group</label><div class="form-control" style="background:var(--bg-body);">${data.blood_group||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Date of Birth</label><div class="form-control" style="background:var(--bg-body);">${data.date_of_birth||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Emergency Contact</label><div class="form-control" style="background:var(--bg-body);">${data.emergency_contact_name||'N/A'}</div></div>
        </div>
        <div class="form-group"><label class="form-label">Address</label><div class="form-control" style="background:var(--bg-body);">${data.address||'N/A'}</div></div>`;
    } else if (type === 'staff') {
      data = await API.get(`/api/staff/${id}`);
      title = data.name;
      html = `<div style="text-align:center;margin-bottom:16px;"><div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#D97706,#F59E0B);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:22px;font-weight:700;">${(data.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}</div><h3 style="margin:0;">${data.name}</h3><p style="color:var(--text-muted);font-size:12px;margin-top:2px;">${data.role||'Staff'}</p></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Phone</label><div class="form-control" style="background:var(--bg-body);">${data.phone||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Email</label><div class="form-control" style="background:var(--bg-body);">${data.email||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Department</label><div class="form-control" style="background:var(--bg-body);">${data.department_name||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Status</label><div class="form-control" style="background:var(--bg-body);">${data.status||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Hire Date</label><div class="form-control" style="background:var(--bg-body);">${data.hire_date||'N/A'}</div></div>
        </div>`;
    } else {
      data = await API.get(`/api/users`);
      const user = data.find(u => u.id === id);
      if (!user) { showToast('User not found', 'error'); return; }
      title = user.full_name || user.username;
      html = `<div style="text-align:center;margin-bottom:16px;"><div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#DC2626,#EF4444);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:22px;font-weight:700;">${(user.full_name||user.username||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}</div><h3 style="margin:0;">${user.full_name||user.username}</h3><p style="color:var(--text-muted);font-size:12px;margin-top:2px;">${user.role}</p></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Username</label><div class="form-control" style="background:var(--bg-body);">${user.username}</div></div>
          <div class="form-group"><label class="form-label">Email</label><div class="form-control" style="background:var(--bg-body);">${user.email||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Role</label><div class="form-control" style="background:var(--bg-body);">${user.role}</div></div>
          <div class="form-group"><label class="form-label">Status</label><div class="form-control" style="background:var(--bg-body);">${user.status||'N/A'}</div></div>
          <div class="form-group"><label class="form-label">Last Login</label><div class="form-control" style="background:var(--bg-body);">${user.last_login||'Never'}</div></div>
        </div>`;
    }
    openModal(title + ' — Profile', html, null);
  } catch(e) { showToast('Failed to load profile: '+e.message, 'error'); }
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('globalSearchWrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('globalSearchResults').classList.remove('active');
  }
});

/* ── Polling & Notifications ── */
async function checkAccountRequests() {
  const badge = document.getElementById('accountReqBadge');
  if (!badge) return;
  try {
    const { count } = await API.get('/api/account-requests/count');
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    // silently fail
  }
}
setInterval(checkAccountRequests, 15000); // Check every 15s
setTimeout(checkAccountRequests, 1000); // Initial check

/* ── Clock ── */
function updateClock() {
  const now = new Date();
  const el = document.getElementById('currentTime');
  if (el) el.textContent = now.toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

/* ── Inject SVG Icons into Sidebar ── */
function injectSidebarIcons() {
  document.querySelectorAll('.nav-icon[data-icon]').forEach(el => {
    const page = el.dataset.icon;
    const iconName = NAV_ICONS[page];
    if (iconName) el.innerHTML = Icon(iconName, 20);
  });
}

/* ── Sidebar Permissions ── */
function setupSidebarPermissions() {
  if (Auth.isAdmin()) document.querySelectorAll('.nav-admin-only').forEach(el => el.classList.add('visible'));
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    const module = PAGE_MODULE_MAP[item.dataset.page];
    if (module && !Auth.canRead(module)) item.classList.add('nav-hidden');
  });
}

/* ── User Profile ── */
function setupUserProfile() {
  const user = Auth.getUser();
  if (!user) return;
  document.getElementById('userName').textContent = user.full_name || user.username;
  const badge = document.getElementById('userRoleBadge');
  badge.textContent = user.role;
  badge.className = 'user-role-badge role-' + user.role.toLowerCase().replace(/\s+/g, '-');

  // Avatar
  const avatarIcon = document.getElementById('userAvatarIcon');
  const avatarImg = document.getElementById('userAvatarImg');
  if (user.avatar_url) {
    avatarImg.src = user.avatar_url;
    avatarImg.style.display = 'block';
    avatarIcon.style.display = 'none';
  } else {
    avatarIcon.innerHTML = Icon('user', 16);
    avatarIcon.style.display = 'flex';
    avatarImg.style.display = 'none';
  }
}

/* ── Theme Toggle ── */
function initTheme() {
  const saved = localStorage.getItem('skycare_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('skycare_theme', next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = theme === 'dark' ? Icon('sun', 18) : Icon('moon', 18);
}

/* ── Top Bar Icons ── */
function injectTopBarIcons() {
  // Change password button
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  if (changePasswordBtn) changePasswordBtn.innerHTML = `${Icon('key', 16)}<span>Password</span>`;
  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.innerHTML = `${Icon('logout', 16)}<span>Logout</span>`;
  // Modal close
  const modalClose = document.getElementById('modalClose');
  if (modalClose) modalClose.innerHTML = Icon('x', 18);
  // Modal save
  const modalSave = document.getElementById('modalSave');
  if (modalSave) modalSave.innerHTML = `${Icon('check', 14)} Save`;
}

/* ── Mobile Sidebar ── */
function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

/* ── Self Password Change ── */
function toggleModalPassword(inputId, buttonEl) {
  const input = document.getElementById(inputId);
  if (!input || !buttonEl) return;

  const shouldShow = input.type === 'password';
  input.type = shouldShow ? 'text' : 'password';

  buttonEl.classList.toggle('active', shouldShow);
  buttonEl.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
  buttonEl.innerHTML = Icon(shouldShow ? 'eyeOff' : 'eye', 16);
  buttonEl.classList.remove('animate');
  void buttonEl.offsetWidth;
  buttonEl.classList.add('animate');
}

function showChangePasswordModal() {
  openModal('Change Your Password', `
    <form id="passwordChangeForm" autocomplete="off">
      <div class="form-group">
        <label class="form-label">Current Password *</label>
        <div class="password-field-wrap">
          <input id="current_password" name="current_password" type="password" class="form-control" placeholder="Enter current password" autocomplete="current-password">
          <button type="button" class="password-toggle-btn" onclick="toggleModalPassword('current_password', this)" aria-label="Show password">${Icon('eye', 16)}</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">New Password *</label>
        <div class="password-field-wrap">
          <input id="new_password" name="new_password" type="password" class="form-control" placeholder="Minimum 6 characters" autocomplete="new-password">
          <button type="button" class="password-toggle-btn" onclick="toggleModalPassword('new_password', this)" aria-label="Show password">${Icon('eye', 16)}</button>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Confirm New Password *</label>
        <div class="password-field-wrap">
          <input id="confirm_password" name="confirm_password" type="password" class="form-control" placeholder="Retype new password" autocomplete="new-password">
          <button type="button" class="password-toggle-btn" onclick="toggleModalPassword('confirm_password', this)" aria-label="Show password">${Icon('eye', 16)}</button>
        </div>
      </div>
    </form>
  `, async () => {
    const data = getFormData('passwordChangeForm');
    if (!data.current_password || !data.new_password || !data.confirm_password) {
      showToast('All password fields are required', 'error');
      return;
    }
    if (data.new_password.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }
    if (data.current_password === data.new_password) {
      showToast('New password must be different from current password', 'error');
      return;
    }
    if (data.new_password !== data.confirm_password) {
      showToast('New password and confirm password do not match', 'error');
      return;
    }

    try {
      await API.put('/api/auth/password', {
        current_password: data.current_password,
        new_password: data.new_password,
      });
      closeModal();
      showToast('Password changed successfully', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to change password', 'error');
    }
  });
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.guard()) return;
  initTheme();
  injectSidebarIcons();
  injectTopBarIcons();
  await Auth.loadPermissions();
  setupUserProfile();
  setupSidebarPermissions();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = item.dataset.page; });
  });
  document.getElementById('menuToggle').addEventListener('click', openMobileSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('changePasswordBtn').addEventListener('click', showChangePasswordModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', () => { if (modalSaveHandler) modalSaveHandler(); });
  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

  updateClock(); setInterval(updateClock, 1000);
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
});
