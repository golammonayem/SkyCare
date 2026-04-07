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
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', () => { if (modalSaveHandler) modalSaveHandler(); });
  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

  updateClock(); setInterval(updateClock, 1000);
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
});
