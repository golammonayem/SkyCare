const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { db, initializeDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
} else {
  console.warn('[SkyCare] Cloudinary credentials are missing. Avatar uploads will be unavailable.');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only images allowed'));
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function fetchAll(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function fetchOne(sql, params = []) {
  const rows = await fetchAll(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const [result] = await db.query(sql, params);
  return result;
}

function uploadAvatarToCloudinary(fileBuffer, userId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_FOLDER || 'skycare/avatars',
        public_id: `avatar-${userId}-${Date.now()}`,
        overwrite: true,
        resource_type: 'image'
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

// ═══════════════════════════════════════════
// AUTHORIZATION MODEL
// ═══════════════════════════════════════════
const PERMS = {
  Admin: { modules: '*' },
  'Senior Doctor': {
    read: ['dashboard', 'departments', 'doctors', 'patients', 'admissions', 'medical-records', 'appointments'],
    write: ['medical-records', 'appointments']
  },
  'Junior Doctor': {
    read: ['dashboard', 'doctors', 'patients', 'medical-records', 'appointments'],
    write: ['medical-records']
  },
  Nurse: {
    read: ['dashboard', 'doctors', 'patients', 'rooms', 'admissions', 'blood-donations'],
    write: ['admissions', 'blood-donations']
  },
  Staff: {
    read: ['dashboard', 'patients', 'admissions', 'billing'],
    write: ['billing']
  }
};

function roleHasAccess(role, module, action = 'read') {
  const rolePerms = PERMS[role];
  if (!rolePerms) return false;
  if (rolePerms.modules === '*') return true;

  const readable = [...(rolePerms.read || []), ...(rolePerms.write || [])];
  const writable = rolePerms.write || [];
  return action === 'write' ? writable.includes(module) : readable.includes(module);
}

function can(module, action = 'read') {
  return (req, res, next) => {
    if (!roleHasAccess(req.user.role, module, action)) {
      return res.status(403).json({ error: 'Access denied for your role' });
    }
    next();
  };
}

async function logAudit(userId, action, resource, resourceId, details) {
  try {
    await run(
      'INSERT INTO audit_log (user_id, action, resource, resource_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId || null, action, resource, resourceId || null, details || '']
    );
  } catch (_) {
    // Audit failures should not block API responses.
  }
}

// ═══════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════
async function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const session = await fetchOne(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.status
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > NOW() AND u.status = 'Active'`,
      [token]
    );

    if (!session) return res.status(401).json({ error: 'Session expired' });

    req.user = session;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ═══════════════════════════════════════════
// CORE ROUTES
// ═══════════════════════════════════════════
app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await fetchOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || user.status !== 'Active') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expires]);
    await run('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    await logAudit(user.id, 'LOGIN', 'auth', user.id, `${user.username} logged in`);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        email: user.email,
        avatar_url: user.avatar_url || null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', auth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    await run('DELETE FROM sessions WHERE token = ?', [token]);
    await logAudit(req.user.id, 'LOGOUT', 'auth', req.user.id, '');
    res.json({ message: 'Logged out' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await fetchOne(
      'SELECT id, username, full_name, email, role, status, last_login, created_at, avatar_url FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user, permissions: PERMS[user.role] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:id/avatar', auth, (req, res) => {
  const targetUserId = Number(req.params.id);
  if (req.user.role !== 'Admin' && req.user.id !== targetUserId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  upload.single('avatar')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!cloudinaryConfigured) {
      return res.status(503).json({ error: 'Cloudinary is not configured on the server' });
    }

    try {
      const uploadResult = await uploadAvatarToCloudinary(req.file.buffer, targetUserId);
      await run('UPDATE users SET avatar_url = ? WHERE id = ?', [uploadResult.secure_url, targetUserId]);
      await logAudit(req.user.id, 'UPDATE', 'user_avatar', targetUserId, 'Avatar updated');
      res.json({ avatar_url: uploadResult.secure_url });
    } catch (uploadErr) {
      res.status(500).json({ error: uploadErr.message });
    }
  });
});

app.put('/api/auth/password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await fetchOne('SELECT * FROM users WHERE id = ?', [req.user.id]);

    if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Current password incorrect' });
    }
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    await run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(new_password, 10), req.user.id]);
    await logAudit(req.user.id, 'PASSWORD_CHANGE', 'users', req.user.id, '');

    res.json({ message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard', auth, can('dashboard', 'read'), async (req, res) => {
  try {
    const canRead = (module) => roleHasAccess(req.user.role, module, 'read');
    const stats = {};

    if (canRead('patients')) {
      stats.totalPatients = (await fetchOne('SELECT COUNT(*) AS c FROM patients')).c;
    }
    if (canRead('doctors')) {
      stats.totalDoctors = (await fetchOne("SELECT COUNT(*) AS c FROM doctors WHERE status = 'Active'"))?.c || 0;
    }
    if (canRead('rooms')) {
      stats.availableRooms = (await fetchOne("SELECT COUNT(*) AS c FROM rooms WHERE status = 'Available'"))?.c || 0;
      stats.totalRooms = (await fetchOne('SELECT COUNT(*) AS c FROM rooms'))?.c || 0;
    }
    if (canRead('admissions')) {
      stats.activeAdmissions = (await fetchOne("SELECT COUNT(*) AS c FROM admissions WHERE status = 'Admitted'"))?.c || 0;
    }
    if (canRead('appointments')) {
      stats.todayAppointments = (await fetchOne('SELECT COUNT(*) AS c FROM appointments WHERE appointment_date = CURDATE()'))?.c || 0;
    }
    if (canRead('billing')) {
      stats.pendingBills = (await fetchOne("SELECT COUNT(*) AS c FROM billing WHERE status IN ('Pending', 'Partial')"))?.c || 0;
    }
    if (canRead('blood-donations')) {
      stats.bloodUnits = (await fetchOne("SELECT COALESCE(SUM(units), 0) AS c FROM blood_donations WHERE status = 'Available'"))?.c || 0;
    }
    if (canRead('staff')) {
      stats.totalStaff = (await fetchOne("SELECT COUNT(*) AS c FROM staff WHERE status = 'Active'"))?.c || 0;
    }
    if (req.user.role === 'Admin') {
      stats.totalUsers = (await fetchOne('SELECT COUNT(*) AS c FROM users'))?.c || 0;
    }

    const recentAdmissions = canRead('admissions')
      ? await fetchAll(
          `SELECT a.*, p.name AS patient_name, r.room_number, d.name AS doctor_name
           FROM admissions a
           LEFT JOIN patients p ON a.patient_id = p.id
           LEFT JOIN rooms r ON a.room_id = r.id
           LEFT JOIN doctors d ON a.doctor_id = d.id
           ORDER BY a.admit_date DESC
           LIMIT 5`
        )
      : [];

    const todayAppointments = canRead('appointments')
      ? await fetchAll(
          `SELECT ap.*, p.name AS patient_name, d.name AS doctor_name
           FROM appointments ap
           LEFT JOIN patients p ON ap.patient_id = p.id
           LEFT JOIN doctors d ON ap.doctor_id = d.id
           WHERE ap.appointment_date = CURDATE()
           ORDER BY ap.appointment_time`
        )
      : [];

    const bloodSummary = canRead('blood-donations')
      ? await fetchAll(
          `SELECT blood_group, COALESCE(SUM(units), 0) AS total_units
           FROM blood_donations
           WHERE status = 'Available'
           GROUP BY blood_group`
        )
      : [];

    res.json({ stats, recentAdmissions, todayAppointments, bloodSummary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════
// USER MANAGEMENT (Admin only)
// ═══════════════════════════════════════════
app.get('/api/users', auth, can('users', 'read'), async (req, res) => {
  try {
    const users = await fetchAll(
      'SELECT id, username, full_name, email, role, status, last_login, created_at, avatar_url FROM users ORDER BY id'
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:id', auth, can('users', 'read'), async (req, res) => {
  try {
    const user = await fetchOne(
      'SELECT id, username, full_name, email, role, status, last_login, created_at, avatar_url FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', auth, can('users', 'write'), async (req, res) => {
  try {
    const { username, password, full_name, email, role } = req.body;
    if (!username || !password || !full_name || !role) {
      return res.status(400).json({ error: 'Username, password, name, and role are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const result = await run(
      'INSERT INTO users (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?)',
      [username, bcrypt.hashSync(password, 10), full_name, email || null, role]
    );

    await logAudit(req.user.id, 'CREATE', 'users', result.insertId, `Created user: ${username} (${role})`);
    res.json({ id: result.insertId, message: 'User created' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id', auth, can('users', 'write'), async (req, res) => {
  try {
    const { full_name, email, role, status, password } = req.body;
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (password) {
      await run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(password, 10), req.params.id]);
    }

    const updates = [];
    const values = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email || null);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length) {
      await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    }

    await logAudit(req.user.id, 'UPDATE', 'users', req.params.id, `Updated user #${req.params.id}`);
    res.json({ message: 'User updated' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/users/:id', auth, can('users', 'write'), async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await run('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
    await run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await logAudit(req.user.id, 'DELETE', 'users', req.params.id, '');

    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/audit-log', auth, can('audit-log', 'read'), async (req, res) => {
  try {
    const rows = await fetchAll(
      `SELECT a.*, u.username, u.full_name
       FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════
// GENERIC CRUD FACTORY
// ═══════════════════════════════════════════
function registerCrud(routePath, table, columns, joinSql, filterFn) {
  app.get(`/api/${routePath}`, auth, can(routePath, 'read'), async (req, res) => {
    try {
      let sql = joinSql
        ? `SELECT ${table}.* ${joinSql.select} FROM ${table} ${joinSql.join}`
        : `SELECT * FROM ${table}`;

      const params = [];
      if (filterFn) {
        const filter = filterFn(req.query);
        if (filter && filter.clause) {
          sql += ` WHERE ${filter.clause}`;
          if (filter.params?.length) params.push(...filter.params);
        }
      }

      sql += ` ORDER BY ${table}.id DESC`;
      const rows = await fetchAll(sql, params);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get(`/api/${routePath}/:id`, auth, can(routePath, 'read'), async (req, res) => {
    try {
      const sql = joinSql
        ? `SELECT ${table}.* ${joinSql.select} FROM ${table} ${joinSql.join} WHERE ${table}.id = ?`
        : `SELECT * FROM ${table} WHERE id = ?`;

      const row = await fetchOne(sql, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(`/api/${routePath}`, auth, can(routePath, 'write'), async (req, res) => {
    try {
      const keys = columns.filter((column) => req.body[column] !== undefined && req.body[column] !== '');
      if (!keys.length) {
        return res.status(400).json({ error: 'No fields provided' });
      }

      const values = keys.map((key) => (req.body[key] === '' ? null : req.body[key]));
      const placeholders = keys.map(() => '?').join(', ');
      const result = await run(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
        values
      );

      await logAudit(req.user.id, 'CREATE', routePath, result.insertId, JSON.stringify(req.body));
      res.json({ id: result.insertId, message: 'Created' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put(`/api/${routePath}/:id`, auth, can(routePath, 'write'), async (req, res) => {
    try {
      const keys = columns.filter((column) => req.body[column] !== undefined);
      if (!keys.length) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const values = keys.map((key) => (req.body[key] === '' ? null : req.body[key]));
      const setClause = keys.map((key) => `${key} = ?`).join(', ');
      await run(`UPDATE ${table} SET ${setClause} WHERE id = ?`, [...values, req.params.id]);

      await logAudit(req.user.id, 'UPDATE', routePath, req.params.id, JSON.stringify(req.body));
      res.json({ message: 'Updated' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete(`/api/${routePath}/:id`, auth, can(routePath, 'write'), async (req, res) => {
    try {
      await run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      await logAudit(req.user.id, 'DELETE', routePath, req.params.id, '');
      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// ═══════════════════════════════════════════
// REGISTER RESOURCES
// ═══════════════════════════════════════════
registerCrud(
  'departments',
  'departments',
  ['name', 'description', 'head_doctor_id'],
  { select: ', d.name AS head_doctor_name', join: 'LEFT JOIN doctors d ON departments.head_doctor_id = d.id' }
);

registerCrud(
  'doctors',
  'doctors',
  ['name', 'specialization', 'qualification', 'experience_years', 'phone', 'email', 'department_id', 'status'],
  { select: ', dep.name AS department_name', join: 'LEFT JOIN departments dep ON doctors.department_id = dep.id' }
);

registerCrud(
  'patients',
  'patients',
  ['name', 'date_of_birth', 'gender', 'blood_group', 'phone', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone']
);

registerCrud(
  'rooms',
  'rooms',
  ['room_number', 'type', 'floor', 'capacity', 'occupied_beds', 'rate_per_day', 'status']
);

registerCrud(
  'admissions',
  'admissions',
  ['patient_id', 'room_id', 'doctor_id', 'admit_date', 'discharge_date', 'diagnosis', 'discharge_summary', 'status'],
  {
    select: ', p.name AS patient_name, r.room_number, d.name AS doctor_name',
    join: 'LEFT JOIN patients p ON admissions.patient_id = p.id LEFT JOIN rooms r ON admissions.room_id = r.id LEFT JOIN doctors d ON admissions.doctor_id = d.id'
  }
);

registerCrud(
  'medical-records',
  'medical_records',
  ['patient_id', 'doctor_id', 'record_date', 'diagnosis', 'treatment', 'prescription', 'notes'],
  {
    select: ', p.name AS patient_name, d.name AS doctor_name',
    join: 'LEFT JOIN patients p ON medical_records.patient_id = p.id LEFT JOIN doctors d ON medical_records.doctor_id = d.id'
  },
  (query) => {
    if (!query.patient_id) return null;
    const patientId = Number(query.patient_id);
    return Number.isInteger(patientId) ? { clause: 'medical_records.patient_id = ?', params: [patientId] } : null;
  }
);

registerCrud(
  'appointments',
  'appointments',
  ['patient_id', 'doctor_id', 'appointment_date', 'appointment_time', 'status', 'reason'],
  {
    select: ', p.name AS patient_name, d.name AS doctor_name',
    join: 'LEFT JOIN patients p ON appointments.patient_id = p.id LEFT JOIN doctors d ON appointments.doctor_id = d.id'
  }
);

registerCrud(
  'billing',
  'billing',
  ['patient_id', 'admission_id', 'total_amount', 'paid_amount', 'payment_method', 'status', 'billing_date', 'due_date', 'description'],
  { select: ', p.name AS patient_name', join: 'LEFT JOIN patients p ON billing.patient_id = p.id' }
);

registerCrud(
  'staff',
  'staff',
  ['name', 'role', 'department_id', 'phone', 'email', 'hire_date', 'status'],
  { select: ', dep.name AS department_name', join: 'LEFT JOIN departments dep ON staff.department_id = dep.id' }
);

registerCrud(
  'staff-duties',
  'staff_duties',
  ['staff_id', 'shift', 'day_of_week', 'assigned_area'],
  { select: ', s.name AS staff_name, s.role AS staff_role', join: 'LEFT JOIN staff s ON staff_duties.staff_id = s.id' }
);

app.get('/api/blood-donations/summary', auth, can('blood-donations', 'read'), async (req, res) => {
  try {
    const summary = await fetchAll(
      `SELECT blood_group, COALESCE(SUM(units), 0) AS total_units
       FROM blood_donations
       WHERE status = 'Available'
       GROUP BY blood_group`
    );
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

registerCrud(
  'blood-donations',
  'blood_donations',
  ['donor_name', 'patient_id', 'blood_group', 'units', 'donation_date', 'expiry_date', 'status']
);

app.get('/api/doctor-schedules/:doctorId', auth, can('doctors', 'read'), async (req, res) => {
  try {
    const rows = await fetchAll(
      `SELECT * FROM doctor_schedules
       WHERE doctor_id = ?
       ORDER BY CASE day_of_week
         WHEN 'Monday' THEN 1
         WHEN 'Tuesday' THEN 2
         WHEN 'Wednesday' THEN 3
         WHEN 'Thursday' THEN 4
         WHEN 'Friday' THEN 5
         WHEN 'Saturday' THEN 6
         WHEN 'Sunday' THEN 7
       END`,
      [req.params.doctorId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/permissions', auth, (req, res) => {
  res.json({ role: req.user.role, permissions: PERMS[req.user.role] });
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startKeepAlive() {
  const selfPingEnabled = String(process.env.SELF_PING_ENABLED || 'true').toLowerCase() === 'true';
  if (!selfPingEnabled) return;

  const baseUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
  const healthUrl = `${baseUrl.replace(/\/$/, '')}/healthz`;

  const doPing = () => {
    try {
      const client = healthUrl.startsWith('https') ? https : http;
      const request = client.get(healthUrl, { timeout: 8000 }, (response) => {
        response.resume();
      });
      request.on('error', () => {});
      request.on('timeout', () => request.destroy());
    } catch (_) {
      // Intentionally ignore keepalive ping errors.
    }
  };

  setTimeout(doPing, 30 * 1000);
  setInterval(doPing, 14 * 60 * 1000);
}

async function bootstrap() {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`\n[SkyCare] HMS running at http://localhost:${PORT}\n`);
    startKeepAlive();
  });
}

bootstrap().catch((error) => {
  console.error('[SkyCare] Startup failed:', error);
  process.exit(1);
});