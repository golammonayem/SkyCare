const express = require('express');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db, initializeDatabase, dataDir } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;
const persistentUploadsDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(persistentUploadsDir)) {
  fs.mkdirSync(persistentUploadsDir, { recursive: true });
}

// Multer config for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, persistentUploadsDir),
  filename: (req, file, cb) => cb(null, `avatar-${req.params.id}-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true); else cb(new Error('Only images allowed'));
}});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(persistentUploadsDir));
initializeDatabase();

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const session = db.prepare(`SELECT u.id, u.username, u.full_name, u.email, u.role, u.status
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.status = 'Active'`).get(token);
  if (!session) return res.status(401).json({ error: 'Session expired' });
  req.user = session;
  next();
}

// ═══════════════════════════════════════════
// ROLE-BASED ACCESS CONTROL
// ═══════════════════════════════════════════
const PERMS = {
  'Admin': { modules: '*' },
  'Senior Doctor': {
    read: ['dashboard','departments','doctors','patients','rooms','admissions','medical-records','appointments','billing','blood-donations'],
    write: ['patients','admissions','medical-records','appointments']
  },
  'Junior Doctor': {
    read: ['dashboard','departments','doctors','patients','rooms','admissions','medical-records','appointments'],
    write: ['medical-records','appointments']
  },
  'Nurse': {
    read: ['dashboard','departments','doctors','patients','rooms','admissions','medical-records','appointments','blood-donations'],
    write: ['rooms','admissions','blood-donations']
  },
  'Staff': {
    read: ['dashboard','patients','appointments','staff','staff-duties','billing'],
    write: ['billing']
  }
};

function can(module, action = 'read') {
  return (req, res, next) => {
    const p = PERMS[req.user.role];
    if (!p) return res.status(403).json({ error: 'Access denied' });
    if (p.modules === '*') return next();
    const allowed = action === 'read' ? [...(p.read || []), ...(p.write || [])] : (p.write || []);
    if (!allowed.includes(module)) return res.status(403).json({ error: 'Access denied for your role' });
    next();
  };
}

// Audit logger
function logAudit(userId, action, resource, resourceId, details) {
  try { db.prepare('INSERT INTO audit_log (user_id,action,resource,resource_id,details) VALUES (?,?,?,?,?)').run(userId, action, resource, resourceId || null, details || ''); } catch(e) {}
}

// ═══════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || user.status !== 'Active') return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?,?,?)').run(user.id, token, expires);
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
    logAudit(user.id, 'LOGIN', 'auth', user.id, `${user.username} logged in`);
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, email: user.email, avatar_url: user.avatar_url || null } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', auth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  logAudit(req.user.id, 'LOGOUT', 'auth', req.user.id, '');
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id,username,full_name,email,role,status,last_login,created_at,avatar_url FROM users WHERE id=?').get(req.user.id);
  res.json({ user, permissions: PERMS[user.role] });
});

// Avatar upload
app.post('/api/users/:id/avatar', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.id !== parseInt(req.params.id)) return res.status(403).json({ error: 'Not authorized' });
  upload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const avatar_url = `/uploads/${req.file.filename}`;
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar_url, req.params.id);
    logAudit(req.user.id, 'UPDATE', 'user_avatar', req.params.id, 'Avatar updated');
    res.json({ avatar_url });
  });
});

app.put('/api/auth/password', auth, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) return res.status(400).json({ error: 'Current password incorrect' });
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(new_password, 10), req.user.id);
    logAudit(req.user.id, 'PASSWORD_CHANGE', 'users', req.user.id, '');
    res.json({ message: 'Password updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
app.get('/api/dashboard', auth, (req, res) => {
  try {
    const stats = {
      totalPatients: db.prepare('SELECT COUNT(*) as c FROM patients').get().c,
      totalDoctors: db.prepare("SELECT COUNT(*) as c FROM doctors WHERE status='Active'").get().c,
      availableRooms: db.prepare("SELECT COUNT(*) as c FROM rooms WHERE status='Available'").get().c,
      totalRooms: db.prepare('SELECT COUNT(*) as c FROM rooms').get().c,
      activeAdmissions: db.prepare("SELECT COUNT(*) as c FROM admissions WHERE status='Admitted'").get().c,
      todayAppointments: db.prepare("SELECT COUNT(*) as c FROM appointments WHERE appointment_date=date('now')").get().c,
      pendingBills: db.prepare("SELECT COUNT(*) as c FROM billing WHERE status IN ('Pending','Partial')").get().c,
      bloodUnits: db.prepare("SELECT COALESCE(SUM(units),0) as c FROM blood_donations WHERE status='Available'").get().c,
      totalStaff: db.prepare("SELECT COUNT(*) as c FROM staff WHERE status='Active'").get().c,
      totalUsers: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    };
    const recentAdmissions = db.prepare(`SELECT a.*, p.name as patient_name, r.room_number, d.name as doctor_name
      FROM admissions a LEFT JOIN patients p ON a.patient_id=p.id LEFT JOIN rooms r ON a.room_id=r.id LEFT JOIN doctors d ON a.doctor_id=d.id
      ORDER BY a.admit_date DESC LIMIT 5`).all();
    const todayAppointments = db.prepare(`SELECT ap.*, p.name as patient_name, d.name as doctor_name
      FROM appointments ap LEFT JOIN patients p ON ap.patient_id=p.id LEFT JOIN doctors d ON ap.doctor_id=d.id
      WHERE ap.appointment_date=date('now') ORDER BY ap.appointment_time`).all();
    const bloodSummary = db.prepare(`SELECT blood_group, COALESCE(SUM(units),0) as total_units
      FROM blood_donations WHERE status='Available' GROUP BY blood_group`).all();
    res.json({ stats, recentAdmissions, todayAppointments, bloodSummary });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// USER MANAGEMENT (Admin only)
// ═══════════════════════════════════════════
app.get('/api/users', auth, can('users', 'read'), (req, res) => {
  try { res.json(db.prepare('SELECT id,username,full_name,email,role,status,last_login,created_at FROM users ORDER BY id').all()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/:id', auth, can('users', 'read'), (req, res) => {
  try {
    const user = db.prepare('SELECT id,username,full_name,email,role,status,last_login,created_at FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, can('users', 'write'), (req, res) => {
  try {
    const { username, password, full_name, email, role } = req.body;
    if (!username || !password || !full_name || !role) return res.status(400).json({ error: 'Username, password, name, and role are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username,password_hash,full_name,email,role) VALUES (?,?,?,?,?)').run(username, hash, full_name, email || null, role);
    logAudit(req.user.id, 'CREATE', 'users', result.lastInsertRowid, `Created user: ${username} (${role})`);
    res.json({ id: result.lastInsertRowid, message: 'User created' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/users/:id', auth, can('users', 'write'), (req, res) => {
  try {
    const { full_name, email, role, status, password } = req.body;
    if (password && password.length >= 6) {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id);
    }
    const updates = [];
    const vals = [];
    if (full_name !== undefined) { updates.push('full_name=?'); vals.push(full_name); }
    if (email !== undefined) { updates.push('email=?'); vals.push(email || null); }
    if (role !== undefined) { updates.push('role=?'); vals.push(role); }
    if (status !== undefined) { updates.push('status=?'); vals.push(status); }
    if (updates.length) db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...vals, req.params.id);
    logAudit(req.user.id, 'UPDATE', 'users', req.params.id, `Updated user #${req.params.id}`);
    res.json({ message: 'User updated' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, can('users', 'write'), (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: "Cannot delete your own account" });
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    logAudit(req.user.id, 'DELETE', 'users', req.params.id, '');
    res.json({ message: 'User deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// AUDIT LOG (Admin only)
// ═══════════════════════════════════════════
app.get('/api/audit-log', auth, can('audit-log', 'read'), (req, res) => {
  try {
    const rows = db.prepare(`SELECT a.*, u.username, u.full_name FROM audit_log a
      LEFT JOIN users u ON a.user_id=u.id ORDER BY a.created_at DESC LIMIT 200`).all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// GENERIC CRUD FACTORY (with auth + RBAC + audit)
// ═══════════════════════════════════════════
function registerCrud(routePath, table, columns, joinSql, filterFn) {
  app.get(`/api/${routePath}`, auth, can(routePath, 'read'), (req, res) => {
    try {
      let sql = joinSql
        ? `SELECT ${table}.* ${joinSql.select} FROM ${table} ${joinSql.join}`
        : `SELECT * FROM ${table}`;
      if (filterFn) { const f = filterFn(req.query); if (f) sql += ` WHERE ${f}`; }
      sql += ` ORDER BY ${table}.id DESC`;
      res.json(db.prepare(sql).all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get(`/api/${routePath}/:id`, auth, can(routePath, 'read'), (req, res) => {
    try {
      const sql = joinSql
        ? `SELECT ${table}.* ${joinSql.select} FROM ${table} ${joinSql.join} WHERE ${table}.id = ?`
        : `SELECT * FROM ${table} WHERE id = ?`;
      const row = db.prepare(sql).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(`/api/${routePath}`, auth, can(routePath, 'write'), (req, res) => {
    try {
      const keys = columns.filter(c => req.body[c] !== undefined && req.body[c] !== '');
      const vals = keys.map(k => req.body[k]);
      const result = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
      logAudit(req.user.id, 'CREATE', routePath, result.lastInsertRowid, JSON.stringify(req.body));
      res.json({ id: result.lastInsertRowid, message: 'Created' });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put(`/api/${routePath}/:id`, auth, can(routePath, 'write'), (req, res) => {
    try {
      const keys = columns.filter(c => req.body[c] !== undefined);
      const vals = keys.map(k => req.body[k] === '' ? null : req.body[k]);
      db.prepare(`UPDATE ${table} SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...vals, req.params.id);
      logAudit(req.user.id, 'UPDATE', routePath, req.params.id, JSON.stringify(req.body));
      res.json({ message: 'Updated' });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete(`/api/${routePath}/:id`, auth, can(routePath, 'write'), (req, res) => {
    try {
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id);
      logAudit(req.user.id, 'DELETE', routePath, req.params.id, '');
      res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

// ═══════════════════════════════════════════
// REGISTER ALL RESOURCES
// ═══════════════════════════════════════════
registerCrud('departments', 'departments',
  ['name','description','head_doctor_id'],
  { select: ', d.name as head_doctor_name', join: 'LEFT JOIN doctors d ON departments.head_doctor_id=d.id' }
);
registerCrud('doctors', 'doctors',
  ['name','specialization','qualification','experience_years','phone','email','department_id','status'],
  { select: ', dep.name as department_name', join: 'LEFT JOIN departments dep ON doctors.department_id=dep.id' }
);
registerCrud('patients', 'patients',
  ['name','date_of_birth','gender','blood_group','phone','email','address','emergency_contact_name','emergency_contact_phone']
);
registerCrud('rooms', 'rooms',
  ['room_number','type','floor','capacity','occupied_beds','rate_per_day','status']
);
registerCrud('admissions', 'admissions',
  ['patient_id','room_id','doctor_id','admit_date','discharge_date','diagnosis','discharge_summary','status'],
  { select: ', p.name as patient_name, r.room_number, d.name as doctor_name',
    join: 'LEFT JOIN patients p ON admissions.patient_id=p.id LEFT JOIN rooms r ON admissions.room_id=r.id LEFT JOIN doctors d ON admissions.doctor_id=d.id' }
);
registerCrud('medical-records', 'medical_records',
  ['patient_id','doctor_id','record_date','diagnosis','treatment','prescription','notes'],
  { select: ', p.name as patient_name, d.name as doctor_name',
    join: 'LEFT JOIN patients p ON medical_records.patient_id=p.id LEFT JOIN doctors d ON medical_records.doctor_id=d.id' },
  (query) => query.patient_id ? `medical_records.patient_id=${Number(query.patient_id)}` : null
);
registerCrud('appointments', 'appointments',
  ['patient_id','doctor_id','appointment_date','appointment_time','status','reason'],
  { select: ', p.name as patient_name, d.name as doctor_name',
    join: 'LEFT JOIN patients p ON appointments.patient_id=p.id LEFT JOIN doctors d ON appointments.doctor_id=d.id' }
);
registerCrud('billing', 'billing',
  ['patient_id','admission_id','total_amount','paid_amount','payment_method','status','billing_date','due_date','description'],
  { select: ', p.name as patient_name', join: 'LEFT JOIN patients p ON billing.patient_id=p.id' }
);
registerCrud('staff', 'staff',
  ['name','role','department_id','phone','email','hire_date','status'],
  { select: ', dep.name as department_name', join: 'LEFT JOIN departments dep ON staff.department_id=dep.id' }
);
registerCrud('staff-duties', 'staff_duties',
  ['staff_id','shift','day_of_week','assigned_area'],
  { select: ', s.name as staff_name, s.role as staff_role', join: 'LEFT JOIN staff s ON staff_duties.staff_id=s.id' }
);

// Blood summary BEFORE generic CRUD :id route
app.get('/api/blood-donations/summary', auth, (req, res) => {
  try {
    res.json(db.prepare("SELECT blood_group, COALESCE(SUM(units),0) as total_units FROM blood_donations WHERE status='Available' GROUP BY blood_group").all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
registerCrud('blood-donations', 'blood_donations',
  ['donor_name','patient_id','blood_group','units','donation_date','expiry_date','status']
);

// Doctor Schedules
app.get('/api/doctor-schedules/:doctorId', auth, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM doctor_schedules WHERE doctor_id=? ORDER BY CASE day_of_week WHEN "Monday" THEN 1 WHEN "Tuesday" THEN 2 WHEN "Wednesday" THEN 3 WHEN "Thursday" THEN 4 WHEN "Friday" THEN 5 WHEN "Saturday" THEN 6 WHEN "Sunday" THEN 7 END').all(req.params.doctorId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Permissions info endpoint (for frontend RBAC)
app.get('/api/permissions', auth, (req, res) => {
  res.json({ role: req.user.role, permissions: PERMS[req.user.role] });
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🏥 SkyCare HMS running at http://localhost:${PORT}\n`);

  const selfPingEnabled = String(process.env.SELF_PING_ENABLED || 'true').toLowerCase() === 'true';
  const baseUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

  if (selfPingEnabled) {
    const healthUrl = `${baseUrl.replace(/\/$/, '')}/healthz`;
    const doPing = () => {
      try {
        const client = healthUrl.startsWith('https') ? https : http;
        const request = client.get(healthUrl, { timeout: 8000 }, (res) => {
          res.resume();
        });
        request.on('error', () => {});
        request.on('timeout', () => request.destroy());
      } catch (_) {
        // Intentionally ignore keepalive ping errors.
      }
    };

    // First ping shortly after boot, then every 14 minutes.
    setTimeout(doPing, 30 * 1000);
    setInterval(doPing, 14 * 60 * 1000);
  }
});
