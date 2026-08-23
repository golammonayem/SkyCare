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

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const geminiConfigured = Boolean(geminiApiKey);
const CURA_SYSTEM = `You are CURA, SkyCare's hospital operations specialist. Speak naturally, warmly, and clearly like a capable conversational AI. You understand this whole website: dashboard, departments, doctors, patients, rooms, admissions, medical records, appointments, billing, staff, staff duties, and blood donations. Use only supplied database facts, never invent medical or operational data, and do not give a diagnosis. When a request is ambiguous, ask a concise clarifying question. When the user asks for a change, explain what you need and use the authorized action workflow.`;

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

if (!geminiConfigured) {
  console.warn('[SkyCare] Gemini API key is missing. The AI assistant will use the database fallback only.');
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

function postJsonRequest(urlString, payload) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(payload);
    const request = https.request(urlString, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        let parsed = {};
        if (responseBody) {
          try {
            parsed = JSON.parse(responseBody);
          } catch (error) {
            reject(new Error(`Gemini returned invalid JSON: ${error.message}`));
            return;
          }
        }

        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve(parsed);
          return;
        }

        reject(new Error(parsed?.error?.message || parsed?.message || `Gemini request failed with status ${response.statusCode}`));
      });
    });

    request.on('error', reject);
    request.write(requestBody);
    request.end();
  });
}

function extractGeminiText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || '').join('').trim();
  if (text) return text;
  const blockReason = response?.promptFeedback?.blockReason;
  throw new Error(blockReason ? `Gemini blocked the request: ${blockReason}` : 'Gemini returned an empty response');
}

async function callGemini({ systemInstruction, prompt, temperature = 0.2, maxOutputTokens = 512 }) {
  if (!geminiConfigured) {
    throw new Error('Gemini API key is not configured');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      topP: 0.95,
      topK: 40
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await postJsonRequest(endpoint, payload);
  return extractGeminiText(response);
}

const AI_RESOURCE_CONFIG = {
  departments: { table: 'departments', columns: ['name', 'description', 'head_doctor_id'] },
  doctors: { table: 'doctors', columns: ['name', 'specialization', 'qualification', 'experience_years', 'phone', 'email', 'gender', 'department_id', 'status'] },
  patients: { table: 'patients', columns: ['name', 'date_of_birth', 'gender', 'blood_group', 'phone', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone'] },
  rooms: { table: 'rooms', columns: ['room_number', 'type', 'floor', 'capacity', 'occupied_beds', 'rate_per_day', 'status'] },
  admissions: { table: 'admissions', columns: ['patient_id', 'room_id', 'doctor_id', 'admit_date', 'discharge_date', 'diagnosis', 'discharge_summary', 'status'] },
  'medical-records': { table: 'medical_records', columns: ['patient_id', 'doctor_id', 'record_date', 'diagnosis', 'treatment', 'prescription', 'notes'] },
  appointments: { table: 'appointments', columns: ['patient_id', 'doctor_id', 'appointment_date', 'appointment_time', 'status', 'reason'] },
  billing: { table: 'billing', columns: ['patient_id', 'admission_id', 'total_amount', 'paid_amount', 'payment_method', 'status', 'billing_date', 'due_date', 'description'] },
  staff: { table: 'staff', columns: ['name', 'role', 'department_id', 'phone', 'email', 'hire_date', 'status'] },
  'staff-duties': { table: 'staff_duties', columns: ['staff_id', 'shift', 'day_of_week', 'assigned_area'] },
  'blood-donations': { table: 'blood_donations', columns: ['donor_name', 'patient_id', 'blood_group', 'units', 'donation_date', 'expiry_date', 'status'] }
};

function parseAiAction(text) {
  try {
    const jsonText = text.trim().replace(/^```json\s*|^```|```$/g, '').trim();
    const parsed = JSON.parse(jsonText);
    return parsed.action && parsed.resource ? parsed : null;
  } catch (_) {
    return null;
  }
}

async function interpretAiAction(query) {
  if (!geminiConfigured) return null;
  const resourceInfo = Object.entries(AI_RESOURCE_CONFIG).map(([name, config]) =>
    `${name}: columns=[${config.columns.join(', ')}]`
  ).join('; ');
  const text = await callGemini({
    systemInstruction: `You are a command parser for a hospital management system. Return ONLY valid JSON.
Identify a database command only when the user clearly asks to create, add, update, edit, delete, or remove a record.
Never invent missing required values. If a required field is missing, set it to null.
Resources and their columns: ${resourceInfo}.
Enum values - doctors.status: Active, On Leave, Inactive; doctors.gender: Male, Female, Other; patients.gender: Male, Female, Other; rooms.type: General, Private, ICU, Emergency; rooms.status: Available, Occupied, Maintenance.
JSON shape: {"action":"create|update|delete|none","resource":"doctors","id":null,"lookup":{"name":"partial or full name"},"fields":{"column":"value"}}.
For ordinary questions, greetings, or listing requests return {"action":"none"}.
Use resource names exactly as listed. For update/delete, use "lookup.name" with the person's name if no ID is given.`,
    prompt: `User command: ${query}`,
    temperature: 0,
    maxOutputTokens: 400
  });
  return parseAiAction(text);
}

async function executeAiAction(action, user) {
  const config = AI_RESOURCE_CONFIG[action.resource];
  if (!config || !['create', 'update', 'delete'].includes(action.action)) throw new Error('Unsupported AI action');
  if (!roleHasAccess(user.role, action.resource, 'write')) throw new Error(`Your role cannot modify ${action.resource}`);

  if (action.action === 'create') {
    const fields = action.fields && typeof action.fields === 'object' ? action.fields : {};
    const keys = config.columns.filter((column) => fields[column] !== undefined && fields[column] !== '');
    if (!keys.length) throw new Error('No fields provided for the new record');
    const values = keys.map((key) => fields[key] === '' ? null : fields[key]);
    const result = await run(`INSERT INTO ${config.table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, values);
    await logAudit(user.id, 'CREATE', action.resource, result.insertId, JSON.stringify(fields));
    return { id: result.insertId, message: `${action.resource} record created` };
  }

  let id = Number(action.id);
  if (!Number.isInteger(id) && action.lookup?.name) {
    const lookupName = action.lookup.name.replace(/^dr\.?\s*/i, '').trim();
    const row = await fetchOne(`SELECT id FROM ${config.table} WHERE LOWER(name) LIKE ? LIMIT 1`, [`%${lookupName.toLowerCase()}%`]);
    id = row?.id;
  }
  if (!Number.isInteger(id)) throw new Error('Please provide an exact record ID or name');
  if (!await fetchOne(`SELECT id FROM ${config.table} WHERE id = ?`, [id])) throw new Error('Record not found');

  if (action.action === 'delete') {
    await run(`DELETE FROM ${config.table} WHERE id = ?`, [id]);
    await logAudit(user.id, 'DELETE', action.resource, id, 'AI command');
    return { id, message: `${action.resource} record deleted` };
  }

  const fields = action.fields && typeof action.fields === 'object' ? action.fields : {};
  const keys = config.columns.filter((column) => fields[column] !== undefined);
  if (!keys.length) throw new Error('No fields provided for the update');
  await run(`UPDATE ${config.table} SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, [...keys.map((key) => fields[key] === '' ? null : fields[key]), id]);
  await logAudit(user.id, 'UPDATE', action.resource, id, JSON.stringify(fields));
  return { id, message: `${action.resource} record updated` };
}

function compactRows(rows, fields, limit = 6) {
  return (rows || []).slice(0, limit).map((row) => {
    const compactRow = {};
    for (const field of fields) {
      compactRow[field] = row[field];
    }
    return compactRow;
  });
}

async function getDashboardAiContext() {
  const totalPatients = (await fetchOne('SELECT COUNT(*) AS c FROM patients'))?.c || 0;
  const totalDoctors = (await fetchOne("SELECT COUNT(*) AS c FROM doctors WHERE status = 'Active'"))?.c || 0;
  const availableRooms = (await fetchOne("SELECT COUNT(*) AS c FROM rooms WHERE status = 'Available'"))?.c || 0;
  const totalRooms = (await fetchOne('SELECT COUNT(*) AS c FROM rooms'))?.c || 0;
  const activeAdmissions = (await fetchOne("SELECT COUNT(*) AS c FROM admissions WHERE status = 'Admitted'"))?.c || 0;
  const pendingBills = (await fetchOne("SELECT COUNT(*) AS c FROM billing WHERE status IN ('Pending', 'Partial')"))?.c || 0;
  const totalBillsVal = (await fetchOne("SELECT SUM(total_amount - paid_amount) AS c FROM billing WHERE status IN ('Pending', 'Partial')"))?.c || 0;

  const occupancyRate = totalRooms > 0 ? Math.round(((totalRooms - availableRooms) / totalRooms) * 100) : 0;
  const recentAdmissions = await fetchAll(
    `SELECT p.name AS patient_name, r.room_number, d.name AS doctor_name, a.status
     FROM admissions a
     LEFT JOIN patients p ON a.patient_id = p.id
     LEFT JOIN rooms r ON a.room_id = r.id
     LEFT JOIN doctors d ON a.doctor_id = d.id
     ORDER BY a.id DESC
     LIMIT 5`
  );
  const todayAppointments = await fetchAll(
    `SELECT p.name AS patient_name, d.name AS doctor_name, ap.appointment_time, ap.status
     FROM appointments ap
     LEFT JOIN patients p ON ap.patient_id = p.id
     LEFT JOIN doctors d ON ap.doctor_id = d.id
     WHERE ap.appointment_date = CURDATE()
     ORDER BY ap.appointment_time
     LIMIT 5`
  );
  const bloodSummary = await fetchAll(
    `SELECT blood_group, COALESCE(SUM(units), 0) AS total_units
     FROM blood_donations
     WHERE status = 'Available'
     GROUP BY blood_group`
  );

  return {
    stats: {
      totalPatients,
      totalDoctors,
      availableRooms,
      totalRooms,
      activeAdmissions,
      pendingBills,
      totalBillsVal,
      occupancyRate
    },
    recentAdmissions: compactRows(recentAdmissions, ['patient_name', 'room_number', 'doctor_name', 'status']),
    todayAppointments: compactRows(todayAppointments, ['patient_name', 'doctor_name', 'appointment_time', 'status']),
    bloodSummary: compactRows(bloodSummary, ['blood_group', 'total_units'])
  };
}

async function getCuraDatabaseContext() {
  const resources = Object.values(AI_RESOURCE_CONFIG);
  const counts = await Promise.all(resources.map(async ({ table }) => ({
    table,
    count: (await fetchOne(`SELECT COUNT(*) AS count FROM ${table}`))?.count || 0
  })));
  return {
    modules: Object.keys(AI_RESOURCE_CONFIG),
    recordCounts: counts,
    dashboard: await getDashboardAiContext()
  };
}

function buildLegacyDashboardSummary(context) {
  const s = context.stats || {};
  let summary = `**Hospital Executive Summary:**\n\n`;
  summary += `Currently, the hospital is operating at **${s.occupancyRate || 0}%** room capacity, with **${s.activeAdmissions || 0}** active admissions and **${s.availableRooms || 0}** rooms available for new patients.\n\n`;
  summary += `We have **${s.totalDoctors || 0}** active doctors serving a total registered patient base of **${s.totalPatients || 0}**.\n\n`;

  if ((s.pendingBills || 0) > 0) {
    summary += `**Financial Alert:** There are ${s.pendingBills} pending bills totaling approximately ৳${Number(s.totalBillsVal || 0).toLocaleString()}, which may require follow-up.\n\n`;
  } else {
    summary += `**Financial Status:** All billing appears to be up to date with no pending invoices.\n\n`;
  }

  summary += `*Recommendation:* ${(s.occupancyRate || 0) > 80 ? 'High occupancy detected. Consider expediting discharges and preparing emergency overflow beds.' : 'Occupancy is stable. Normal operations can continue.'}`;
  return summary;
}

function buildDashboardGeminiPrompt(context) {
  return [
    'Summarize the current hospital dashboard in a concise, executive-friendly way.',
    'Focus on occupancy, staffing, admissions, billing risk, and any actionable recommendation.',
    'Use Markdown and keep the answer to 4 short paragraphs or fewer.',
    '',
    `Database context:\n${JSON.stringify(context, null, 2)}`
  ].join('\n');
}

async function buildAiChatContext(query) {
  const normalizedQuery = (query || '').trim();
  const lowerQuery = normalizedQuery.toLowerCase();
  const isPdf = /pdf|report|download|print/.test(lowerQuery);
  const context = {
    query: normalizedQuery,
    topic: 'general',
    isPdf,
    title: '',
    rows: [],
    legacyAnswer: '',
    pdfData: null
  };
  context.website = await getCuraDatabaseContext();

  const [departments] = await db.query('SELECT name FROM departments');
  const matchedDept = departments.map((d) => d.name.toLowerCase()).find((name) => lowerQuery.includes(name)) || null;
  context.matchedDept = matchedDept;

  if (lowerQuery.match(/all info|everything|overview|hospital information|tell me about the hospital/)) {
    const dashboardContext = await getDashboardAiContext();
    context.topic = 'overview';
    context.title = 'Hospital Overview';
    context.rows = [];
    context.overview = dashboardContext;
    context.legacyAnswer = buildLegacyDashboardSummary(dashboardContext);
    return context;
  }

  if (lowerQuery.match(/can you|could you|are you able|if i give|help me/) && lowerQuery.match(/add|create|register/) && lowerQuery.match(/doctor|patient|staff|record/)) {
    context.topic = 'capability';
    context.legacyAnswer = 'Yes. I am CURA, and I can help an authorized administrator add that record. Please provide the full details, such as name, specialization, qualification, experience, phone, email, department, and status. I will ask for any required information that is missing before creating it.';
    return context;
  }

  if (lowerQuery.match(/doctor|doc|physician|surgeon|\bdr\.?\b|doctress/)) {
    let sql = `SELECT doctors.id, doctors.name, doctors.status, doctors.phone, doctors.email, doctors.specialization,
              doctors.qualification, doctors.experience_years, doctors.gender,
                      departments.name AS department_name
               FROM doctors
               LEFT JOIN departments ON doctors.department_id = departments.id`;
    let params = [];
    let whereClauses = [];
    context.topic = 'doctors';
    context.title = 'Doctors List';

    // Gender filtering: "doctress", "female doctor", "male doctor"
    const isFemaleRequest = lowerQuery.match(/doctress|female doctor|women doctor|lady doctor/);
    const isMaleRequest = lowerQuery.match(/male doctor|men doctor/);
    if (isFemaleRequest) {
      whereClauses.push("doctors.gender = 'Female'");
      context.title = 'Female Doctors';
    } else if (isMaleRequest) {
      whereClauses.push("doctors.gender = 'Male'");
      context.title = 'Male Doctors';
    }

    // Temporal queries: "last added", "newest", "most recent", "recently added"
    const isTemporalRequest = lowerQuery.match(/last added|newest|most recent|recently added|latest/);

    // Count queries: "how many", "total", "count"
    const isCountRequest = lowerQuery.match(/how many|total number|count of|number of/) && !lowerQuery.match(/name|list|who|all|show/);

    const isDetailRequest = lowerQuery.match(/info|information|detail|details|about|contact|phone|email|qualification|specialization/);
    if (isDetailRequest) {
      const ignoredWords = new Set(['give', 'me', 'info', 'information', 'detail', 'details', 'about', 'contact', 'phone', 'email', 'qualification', 'specialization', 'of', 'the', 'doctor', 'doctors', 'dr', 'tell', 'show', 'female', 'male', 'doctress', 'lady', 'women', 'men']);
      const nameTokens = lowerQuery.split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ignoredWords.has(word));
      context.title = 'Doctor Details';
      context.isDetailRequest = true;
      if (nameTokens.length) {
        whereClauses.push(`(${nameTokens.map(() => 'LOWER(doctors.name) LIKE ?').join(' OR ')})`);
        params.push(...nameTokens.map((token) => `%${token}%`));
      } else if (!isFemaleRequest && !isMaleRequest) {
        whereClauses.push('1 = 0');
      }
    } else if (matchedDept) {
      whereClauses.push('LOWER(departments.name) LIKE ?');
      params.push(`%${matchedDept}%`);
      context.title = `${matchedDept.charAt(0).toUpperCase() + matchedDept.slice(1)} Doctors`;
    } else if (lowerQuery.match(/leave|inactive|absent/)) {
      whereClauses.push("doctors.status = 'On Leave'");
      context.title = 'Doctors on Leave';
    }

    if (whereClauses.length) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (isTemporalRequest) {
      sql += ' ORDER BY doctors.id DESC LIMIT 1';
      context.title = 'Most Recently Added Doctor';
    } else {
      sql += ' ORDER BY doctors.id DESC';
    }

    const [rows] = await db.query(sql, params);
    context.rows = rows;

    if (isCountRequest) {
      context.legacyAnswer = `We have **${rows.length}** ${isFemaleRequest ? 'female ' : isMaleRequest ? 'male ' : ''}doctors${matchedDept ? ` in ${matchedDept}` : ''}.`;
      context.useDirectAnswer = true;
    } else if (isPdf) {
      context.pdfData = {
        title: context.title,
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'department_name', label: 'Department' },
          { key: 'specialization', label: 'Specialty' },
          { key: 'gender', label: 'Gender' },
          { key: 'phone', label: 'Phone' },
          { key: 'status', label: 'Status' }
        ],
        rows
      };
      context.legacyAnswer = `I have generated the PDF report for **${context.title}**. It should download automatically.`;
    } else if (rows.length === 0) {
      if (isFemaleRequest || isMaleRequest) {
        context.legacyAnswer = `I couldn't find any ${isFemaleRequest ? 'female' : 'male'} doctors. This may be because gender information hasn't been set for the doctors in the system yet. You can update each doctor's gender through the dashboard or ask me to update it.`;
      } else {
        context.legacyAnswer = `I couldn't find any doctors matching that criteria.`;
      }
      context.useDirectAnswer = true;
    } else if (isTemporalRequest) {
      const doc = rows[0];
      context.legacyAnswer = `The most recently added doctor is:\n\n**${doc.name}**\n- Specialization: ${doc.specialization || 'Not provided'}\n- Department: ${doc.department_name || 'Not assigned'}\n- Gender: ${doc.gender || 'Not set'}\n- Phone: ${doc.phone || 'Not provided'}\n- Email: ${doc.email || 'Not provided'}\n- Status: ${doc.status}`;
      context.useDirectAnswer = true;
    } else if (isDetailRequest) {
      context.legacyAnswer = rows.map((doctor) => `**${doctor.name}**\n- Specialization: ${doctor.specialization || 'Not provided'}\n- Qualification: ${doctor.qualification || 'Not provided'}\n- Experience: ${doctor.experience_years || 0} years\n- Department: ${doctor.department_name || 'Not assigned'}\n- Gender: ${doctor.gender || 'Not set'}\n- Phone: ${doctor.phone || 'Not provided'}\n- Email: ${doctor.email || 'Not provided'}\n- Status: ${doctor.status}`).join('\n\n');
    } else if (lowerQuery.match(/name|list|who|all|doctress/) || matchedDept) {
      context.legacyAnswer = `Here are the ${context.title.toLowerCase()} (${rows.length} total):\n` + rows.map((row) => `- **${row.name}** (${row.department_name || 'No Dept'})`).join('\n');
      context.useDirectAnswer = true;
    } else {
      context.legacyAnswer = `We have **${rows.length}** matching doctors. Ask me to \"list them\" or \"make a pdf\".`;
    }
  } else if (lowerQuery.match(/patient|pat|sick/)) {
    let sql = 'SELECT name, phone, blood_group, gender, status FROM patients ORDER BY id DESC';
    let title = 'Patients List';
    context.topic = 'patients';

    const isTemporalPatient = lowerQuery.match(/last added|newest|most recent|recently added|latest/);

    if (lowerQuery.match(/active/)) {
      sql = "SELECT name, phone, blood_group, gender, status FROM patients WHERE status = 'Active' ORDER BY id DESC";
      title = 'Active Patients';
    }

    if (isTemporalPatient) {
      sql = 'SELECT name, phone, blood_group, gender, status FROM patients ORDER BY id DESC LIMIT 1';
      title = 'Most Recently Added Patient';
    }

    const [rows] = await db.query(sql);
    context.rows = rows;
    context.title = title;

    if (isPdf) {
      context.pdfData = {
        title,
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'blood_group', label: 'Blood Group' },
          { key: 'gender', label: 'Gender' },
          { key: 'phone', label: 'Phone' }
        ],
        rows
      };
      context.legacyAnswer = `I have generated the PDF report for **${title}**.`;
    } else if (isTemporalPatient && rows.length) {
      const p = rows[0];
      context.legacyAnswer = `The most recently added patient is: **${p.name}** (${p.gender || 'Gender not set'}, Blood: ${p.blood_group || 'N/A'}, Phone: ${p.phone || 'N/A'})`;
      context.useDirectAnswer = true;
    } else if (lowerQuery.match(/name|list|who|all/)) {
      context.legacyAnswer = `Here are the patients (${rows.length} total):\n` + rows.map((row) => `- **${row.name}** (${row.gender || 'N/A'}, ${row.blood_group || 'N/A'})`).join('\n');
      context.useDirectAnswer = true;
    } else {
      context.legacyAnswer = `We have **${rows.length}** registered patients. You can ask me to \"list them\" or \"make a pdf\".`;
    }
  } else if (lowerQuery.match(/staff|nurse/)) {
    let sql = 'SELECT name, role, phone, status FROM staff ORDER BY id DESC';
    let title = 'Staff List';
    context.topic = 'staff';

    const isTemporalStaff = lowerQuery.match(/last added|newest|most recent|recently added|latest/);
    const isNurseRequest = lowerQuery.match(/nurse/);

    if (isNurseRequest) {
      sql = "SELECT name, role, phone, status FROM staff WHERE LOWER(role) LIKE '%nurse%' ORDER BY id DESC";
      title = 'Nurses';
    }

    if (lowerQuery.match(/leave/)) {
      sql = "SELECT name, role, phone, status FROM staff WHERE status = 'On Leave' ORDER BY id DESC";
      title = 'Staff on Leave';
    }

    if (isTemporalStaff) {
      sql = 'SELECT name, role, phone, status FROM staff ORDER BY id DESC LIMIT 1';
      title = 'Most Recently Added Staff';
    }

    const [rows] = await db.query(sql);
    context.rows = rows;
    context.title = title;

    if (isPdf) {
      context.pdfData = {
        title,
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role' },
          { key: 'phone', label: 'Phone' },
          { key: 'status', label: 'Status' }
        ],
        rows
      };
      context.legacyAnswer = `I have generated the PDF report for **${title}**.`;
    } else if (isTemporalStaff && rows.length) {
      const s = rows[0];
      context.legacyAnswer = `The most recently added staff member is: **${s.name}** (${s.role}, Phone: ${s.phone || 'N/A'}, Status: ${s.status})`;
      context.useDirectAnswer = true;
    } else if (lowerQuery.match(/name|list|who|all|nurse/)) {
      context.legacyAnswer = `Here is the ${title.toLowerCase()} (${rows.length} total):\n` + rows.map((row) => `- **${row.name}** (${row.role})`).join('\n');
      context.useDirectAnswer = true;
    } else {
      context.legacyAnswer = `We have **${rows.length}** staff members.`;
    }
  } else if (lowerQuery.match(/room|bed|capacity/)) {
    const [rows] = await db.query('SELECT room_number, type, status FROM rooms');
    context.topic = 'rooms';
    context.rows = rows;
    context.title = 'Rooms Report';

    if (isPdf) {
      context.pdfData = {
        title: 'Rooms Report',
        columns: [
          { key: 'room_number', label: 'Room' },
          { key: 'type', label: 'Type' },
          { key: 'status', label: 'Status' }
        ],
        rows
      };
      context.legacyAnswer = 'I have generated the Rooms PDF report.';
    } else if (lowerQuery.match(/available|empty|free/)) {
      const availableRooms = rows.filter((row) => row.status === 'Available');
      context.legacyAnswer = `Available rooms:\n` + availableRooms.map((row) => `- Room **${row.room_number}** (${row.type})`).join('\n');
    } else {
      context.legacyAnswer = `There are **${rows.filter((row) => row.status === 'Available').length}** out of ${rows.length} rooms available.`;
    }
  } else if (lowerQuery.match(/bill|money|finance|pending/)) {
    const [rows] = await db.query("SELECT p.name as patient, b.total_amount, b.paid_amount, b.status FROM billing b JOIN patients p ON b.patient_id = p.id WHERE b.status IN ('Pending', 'Partial')");
    context.topic = 'billing';
    context.rows = rows;
    context.title = 'Pending Bills';

    if (isPdf) {
      context.pdfData = {
        title: 'Pending Bills',
        columns: [
          { key: 'patient', label: 'Patient' },
          { key: 'total_amount', label: 'Total' },
          { key: 'paid_amount', label: 'Paid' },
          { key: 'status', label: 'Status' }
        ],
        rows
      };
      context.legacyAnswer = 'I have generated the Pending Bills PDF report.';
    } else if (rows.length) {
      context.legacyAnswer = `We have ${rows.length} pending bills:\n` + rows.map((row) => `- **${row.patient}**: Owed ৳${row.total_amount - row.paid_amount}`).join('\n');
    } else {
      context.legacyAnswer = 'There are currently no pending bills.';
    }
  } else if (lowerQuery.match(/hi|hello|hey/)) {
    context.topic = 'greeting';
    context.legacyAnswer = 'Hello! I am CURA, your SkyCare hospital operations specialist. I can answer questions about the hospital and help authorized administrators manage records.';
  } else {
    const like = `%${lowerQuery}%`;
    const [found] = await db.query(
      `SELECT name, 'Doctor' AS type FROM doctors WHERE LOWER(name) LIKE ?
       UNION SELECT name, 'Patient' AS type FROM patients WHERE LOWER(name) LIKE ?
       UNION SELECT name, 'Staff' AS type FROM staff WHERE LOWER(name) LIKE ?
       LIMIT 5`, [like, like, like]
    );
    context.topic = 'search';
    context.rows = found;

    if (found.length) {
      context.legacyAnswer = `I found these matches for your query:\n` + found.map((row) => `- **${row.name}** (${row.type})`).join('\n');
    } else {
      context.legacyAnswer = "I couldn't find any matching records. Try asking for a 'pdf of doctors' or 'who is on leave'.";
    }
  }

  return context;
}

function buildAiChatPrompt(context, history) {
  const parts = [
    CURA_SYSTEM,
    '',
    'CRITICAL RULES:',
    '1. ONLY mention records that appear in the provided "rows" data below. Do NOT invent, guess, or hallucinate any names, numbers, or records that are not in the data.',
    '2. If the data contains 0 rows, say you found no matching records.',
    '3. Answer only from the provided database context.',
    '4. If the context does not contain enough information, say that clearly.',
    '5. Keep the response concise, helpful, and formatted in Markdown when useful.',
    '6. When listing records, include ALL records from the rows data, do not skip any.',
    ''
  ];

  // Add conversation history for multi-turn context
  if (history && history.length > 0) {
    parts.push('Previous conversation:');
    for (const msg of history.slice(-10)) {
      parts.push(`${msg.role === 'user' ? 'User' : 'CURA'}: ${msg.text}`);
    }
    parts.push('');
  }

  parts.push(`User query: ${context.query}`);
  parts.push('Website capabilities: CURA can read live information and, for Admin users, create, update, or delete records through protected SkyCare workflows. Destructive actions require confirmation.');

  // Send ALL rows to Gemini (no truncation) so it never needs to hallucinate
  const contextData = {
    topic: context.topic,
    title: context.title,
    matchedDept: context.matchedDept || null,
    isPdf: context.isPdf,
    overview: context.overview || null,
    totalRecords: (context.rows || []).length,
    rows: context.rows || []
  };

  parts.push(`Database context: ${JSON.stringify(contextData, null, 2)}`);

  return parts.join('\n');
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

app.get('/api/ai-summary', auth, can('dashboard', 'read'), async (req, res) => {
  try {
    const context = await getDashboardAiContext();
    let summary = buildLegacyDashboardSummary(context);

    if (geminiConfigured) {
      try {
        summary = await callGemini({
          systemInstruction: CURA_SYSTEM,
          prompt: buildDashboardGeminiPrompt(context),
          temperature: 0.2,
          maxOutputTokens: 512
        });
      } catch (modelError) {
        console.warn('[SkyCare] Gemini summary request failed:', modelError.message);
      }
    }

    res.json({ summary, source: geminiConfigured ? 'gemini' : 'fallback' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ai-status', auth, can('dashboard', 'read'), async (req, res) => {
  try {
    res.json({
      source: geminiConfigured ? 'gemini' : 'fallback',
      geminiConfigured
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai-chat', auth, can('dashboard', 'read'), async (req, res) => {
  try {
    const query = (req.body.query || '').trim();
    const history = req.body.history || [];
    let action = req.body.action;
    if (!action) {
      try {
        action = await interpretAiAction(query);
      } catch (modelError) {
        console.warn('[SkyCare] Gemini action classification failed:', modelError.message);
      }
    }
    if (action && action.action && action.action !== 'none') {
      if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin users can use AI to modify records' });
      if (!AI_RESOURCE_CONFIG[action.resource]) return res.status(400).json({ error: 'Unsupported AI resource' });
      if (action.action === 'delete' && !req.body.confirmed) {
        return res.json({ answer: `I found a ${action.resource} record to delete. Please confirm this destructive action.`, action, needsConfirmation: true, source: 'gemini' });
      }
      const result = await executeAiAction(action, req.user);
      return res.json({ answer: result.message, actionResult: result, source: 'gemini' });
    }

    const context = await buildAiChatContext(query);

    // For detail requests, PDF exports, and direct-answer queries (lists, counts, temporal),
    // use the legacyAnswer directly from the database — this prevents Gemini from hallucinating
    if (context.isDetailRequest || context.useDirectAnswer) {
      return res.json({ answer: context.legacyAnswer, pdfData: null, source: 'database' });
    }

    if (context.pdfData) {
      return res.json({
        answer: context.legacyAnswer,
        pdfData: context.pdfData,
        source: 'database'
      });
    }

    // For conversational/complex queries, use Gemini with full context and history
    let answer = context.legacyAnswer;
    if (geminiConfigured) {
      try {
        answer = await callGemini({
          systemInstruction: CURA_SYSTEM,
          prompt: buildAiChatPrompt(context, history),
          temperature: 0.25,
          maxOutputTokens: 1024
        });
      } catch (modelError) {
        console.warn('[SkyCare] Gemini chat request failed:', modelError.message);
      }
    }

    res.json({ answer, pdfData: null, source: geminiConfigured ? 'gemini' : 'fallback' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/global-search', auth, can('dashboard', 'read'), async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);
    const like = `%${q}%`;

    const [doctors] = await db.query(
      `SELECT id, name, specialization AS detail, phone, email, status, 'doctor' AS type
       FROM doctors WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? LIMIT 10`, [like, like, like]
    );
    const [patients] = await db.query(
      `SELECT id, name, blood_group AS detail, phone, email, 'Active' AS status, 'patient' AS type
       FROM patients WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? LIMIT 10`, [like, like, like]
    );
    const [staff] = await db.query(
      `SELECT id, name, role AS detail, phone, email, status, 'staff' AS type
       FROM staff WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? LIMIT 10`, [like, like, like]
    );
    const [users] = await db.query(
      `SELECT id, full_name AS name, role AS detail, '' AS phone, email, status, 'user' AS type
       FROM users WHERE full_name LIKE ? OR email LIKE ? OR username LIKE ? LIMIT 10`, [like, like, like]
    );

    res.json([...doctors, ...patients, ...staff, ...users]);
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
      if (!keys.length) return res.status(400).json({ error: 'No fields provided' });

      const values = keys.map((key) => (req.body[key] === '' ? null : req.body[key]));
      const placeholders = keys.map(() => '?').join(', ');
      const result = await run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, values);
      
      const insertId = result.insertId;
      await logAudit(req.user.id, 'CREATE', routePath, insertId, JSON.stringify(req.body));

      res.json({ id: insertId, message: 'Created' });
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
  ['name', 'specialization', 'qualification', 'experience_years', 'phone', 'email', 'gender', 'department_id', 'status'],
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