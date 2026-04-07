/* ═══ SkyCare Authentication & Authorization ═══ */

const Auth = {
  getToken() { return localStorage.getItem('skycare_token'); },
  getUser() { try { return JSON.parse(localStorage.getItem('skycare_user')); } catch { return null; } },

  isLoggedIn() { return !!this.getToken() && !!this.getUser(); },

  logout() {
    const token = this.getToken();
    if (token) {
      fetch('/api/auth/logout', { method:'POST', headers:{ 'Authorization':'Bearer '+token } }).catch(()=>{});
    }
    localStorage.removeItem('skycare_token');
    localStorage.removeItem('skycare_user');
    localStorage.removeItem('skycare_perms');
    window.location.href = '/login.html';
  },

  // Check auth on page load
  guard() {
    if (!this.isLoggedIn()) { window.location.href = '/login.html'; return false; }
    return true;
  },

  // Get role
  getRole() { const u = this.getUser(); return u ? u.role : null; },

  // Permission checks
  _perms: null,
  async loadPermissions() {
    try {
      const res = await fetch('/api/permissions', { headers:{ 'Authorization':'Bearer '+this.getToken() } });
      if (res.status === 401) { this.logout(); return; }
      const data = await res.json();
      this._perms = data.permissions;
      localStorage.setItem('skycare_perms', JSON.stringify(data.permissions));
    } catch { this._perms = JSON.parse(localStorage.getItem('skycare_perms') || 'null'); }
  },

  getPerms() {
    if (this._perms) return this._perms;
    try { return JSON.parse(localStorage.getItem('skycare_perms') || 'null'); } catch { return null; }
  },

  canRead(module) {
    const p = this.getPerms();
    if (!p) return false;
    if (p.modules === '*') return true;
    return [...(p.read||[]), ...(p.write||[])].includes(module);
  },

  canWrite(module) {
    const p = this.getPerms();
    if (!p) return false;
    if (p.modules === '*') return true;
    return (p.write||[]).includes(module);
  },

  isAdmin() { return this.getRole() === 'Admin'; }
};

// Override API to include auth token
const _origGet = API.get;
const _origPost = API.post;
const _origPut = API.put;
const _origDel = API.del;

API.get = async function(url) {
  const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + Auth.getToken() } });
  if (res.status === 401) { Auth.logout(); throw new Error('Session expired'); }
  if (res.status === 403) throw new Error('Access denied');
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || 'Request failed'); }
  return res.json();
};

API.post = async function(url, data) {
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+Auth.getToken() }, body:JSON.stringify(data) });
  if (res.status === 401) { Auth.logout(); throw new Error('Session expired'); }
  if (res.status === 403) throw new Error('Access denied for your role');
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || 'Request failed'); }
  return res.json();
};

API.put = async function(url, data) {
  const res = await fetch(url, { method:'PUT', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+Auth.getToken() }, body:JSON.stringify(data) });
  if (res.status === 401) { Auth.logout(); throw new Error('Session expired'); }
  if (res.status === 403) throw new Error('Access denied for your role');
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || 'Request failed'); }
  return res.json();
};

API.del = async function(url) {
  const res = await fetch(url, { method:'DELETE', headers:{ 'Authorization':'Bearer '+Auth.getToken() } });
  if (res.status === 401) { Auth.logout(); throw new Error('Session expired'); }
  if (res.status === 403) throw new Error('Access denied for your role');
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || 'Request failed'); }
  return res.json();
};

// ═══ Role badge helper ═══
function roleBadge(role) {
  const colors = {
    'Admin': 'danger', 'Senior Doctor': 'info', 'Junior Doctor': 'success',
    'Nurse': 'warning', 'Staff': 'default'
  };
  return badgeHtml(role, colors[role] || 'default');
}
