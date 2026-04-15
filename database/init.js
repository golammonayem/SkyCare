const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'schema.sql');

const REQUIRED_TIDB_ENV = ['TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE'];
const missingEnv = REQUIRED_TIDB_ENV.filter((key) => !process.env[key]);

if (missingEnv.length) {
  throw new Error(`[SkyCare] Missing TiDB environment variables: ${missingEnv.join(', ')}`);
}

function resolveSslConfig() {
  const disableTls = String(process.env.TIDB_DISABLE_TLS || 'false').toLowerCase() === 'true';
  if (disableTls) return undefined;

  const ca = process.env.TIDB_SSL_CA;
  if (ca) {
    return {
      ca: ca.includes('\\n') ? ca.replace(/\\n/g, '\n') : ca
    };
  }

  return { minVersion: 'TLSv1.2' };
}

const db = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  ssl: resolveSslConfig(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  timezone: 'Z',
  charset: 'utf8mb4',
  dateStrings: true
});

const SEED_PASSWORDS = {
  admin: process.env.SKYCARE_ADMIN_PASSWORD || 'SkyAdmin#2026',
  'dr.ayesha': process.env.SKYCARE_DR_AYESHA_PASSWORD || 'DrAyesha#2026',
  'dr.rafi': process.env.SKYCARE_DR_RAFI_PASSWORD || 'DrRafi#2026',
  'nurse.anwar': process.env.SKYCARE_NURSE_ANWAR_PASSWORD || 'NurseAnwar#2026',
  'staff.belal': process.env.SKYCARE_STAFF_BELAL_PASSWORD || 'StaffBelal#2026'
};

const LEGACY_WEAK_PASSWORDS = {
  admin: 'admin123',
  'dr.ayesha': 'doctor123',
  'dr.rafi': 'doctor123',
  'nurse.anwar': 'nurse123',
  'staff.belal': 'staff123'
};

async function one(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

async function runStatements(statements) {
  for (const statement of statements) {
    await db.query(statement);
  }
}

function loadSchemaStatements() {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  return sql
    .replace(/\r\n/g, '\n')
    .split(/;\s*\n|;\s*$/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function initializeDatabase() {
  await db.query('SELECT 1');
  await runStatements(loadSchemaStatements());

  await seedUsers();
  await resetInsecureDefaultPasswords();
  await seedData();
}

async function seedUsers() {
  const row = await one('SELECT COUNT(*) AS c FROM users');
  if (row && row.c > 0) return;

  console.log('[SkyCare] Seeding user accounts...');
  const users = [
    ['admin', SEED_PASSWORDS.admin, 'System Administrator', 'admin@skycare.com', 'Admin'],
    ['dr.ayesha', SEED_PASSWORDS['dr.ayesha'], 'Dr. Ayesha Rahman', 'ayesha@skycare.com', 'Senior Doctor'],
    ['dr.rafi', SEED_PASSWORDS['dr.rafi'], 'Dr. Rafi Ahmed', 'rafi@skycare.com', 'Junior Doctor'],
    ['nurse.anwar', SEED_PASSWORDS['nurse.anwar'], 'Anwar Hossain', 'anwar@skycare.com', 'Nurse'],
    ['staff.belal', SEED_PASSWORDS['staff.belal'], 'Belal Ahmed', 'belal@skycare.com', 'Staff']
  ];

  for (const [username, password, fullName, email, role] of users) {
    await db.query(
      'INSERT INTO users (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?)',
      [username, bcrypt.hashSync(password, 10), fullName, email, role]
    );
  }
  console.log('[SkyCare] Users seeded');
}

async function resetInsecureDefaultPasswords() {
  const updatedUsers = [];

  for (const [username, weakPassword] of Object.entries(LEGACY_WEAK_PASSWORDS)) {
    const user = await one('SELECT id, password_hash FROM users WHERE username = ?', [username]);
    if (!user) continue;

    if (!bcrypt.compareSync(weakPassword, user.password_hash)) {
      continue;
    }

    const nextPassword = SEED_PASSWORDS[username];
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(nextPassword, 10), user.id]);
    await db.query('DELETE FROM sessions WHERE user_id = ?', [user.id]);
    updatedUsers.push(username);
  }

  if (updatedUsers.length) {
    console.warn(`[SkyCare] Reset weak default passwords for: ${updatedUsers.join(', ')}.`);
    console.warn('[SkyCare] Set SKYCARE_*_PASSWORD environment variables in production.');
  }
}

async function seedData() {
  const row = await one('SELECT COUNT(*) AS c FROM departments');
  if (row && row.c > 0) return;

  console.log('[SkyCare] Seeding sample data...');

  const departments = [
    ['Cardiology', 'Heart and cardiovascular system'],
    ['Neurology', 'Brain and nervous system'],
    ['Orthopedics', 'Bones, joints, and muscles'],
    ['Pediatrics', 'Medical care for infants and children'],
    ['General Medicine', 'Primary healthcare and general treatment'],
    ['Emergency', 'Emergency and trauma care']
  ];
  for (const department of departments) {
    await db.query('INSERT INTO departments (name, description) VALUES (?, ?)', department);
  }

  const doctors = [
    ['Dr. Ayesha Rahman', 'Cardiologist', 'MBBS, MD Cardiology', 12, '01711000001', 'dr.ayesha@hospital.com', 1, 'Active'],
    ['Dr. Karim Hossain', 'Neurologist', 'MBBS, MD Neurology', 15, '01711000002', 'karim@hospital.com', 2, 'Active'],
    ['Dr. Fatima Noor', 'Orthopedic Surgeon', 'MBBS, MS Orthopedics', 10, '01711000003', 'fatima@hospital.com', 3, 'Active'],
    ['Dr. Rafi Ahmed', 'Pediatrician', 'MBBS, DCH', 8, '01711000004', 'dr.rafi@hospital.com', 4, 'Active'],
    ['Dr. Nusrat Jahan', 'General Physician', 'MBBS', 5, '01711000005', 'nusrat@hospital.com', 5, 'Active'],
    ['Dr. Tanvir Islam', 'Emergency Medicine', 'MBBS, FCPS', 14, '01711000006', 'tanvir@hospital.com', 6, 'Active'],
    ['Dr. Sadia Kabir', 'Cardiologist', 'MBBS, MD Cardiology', 9, '01711000007', 'sadia@hospital.com', 1, 'Active'],
    ['Dr. Imran Chowdhury', 'Neurologist', 'MBBS, FCPS Neurology', 11, '01711000008', 'imran@hospital.com', 2, 'On Leave']
  ];
  for (const doctor of doctors) {
    await db.query(
      'INSERT INTO doctors (name, specialization, qualification, experience_years, phone, email, department_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      doctor
    );
  }

  for (let i = 1; i <= 6; i += 1) {
    await db.query('UPDATE departments SET head_doctor_id = ? WHERE id = ?', [i, i]);
  }

  for (let doctorId = 1; doctorId <= 8; doctorId += 1) {
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      await db.query(
        'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
        [doctorId, day, '09:00', '17:00']
      );
    }
    await db.query(
      'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
      [doctorId, 'Saturday', '09:00', '13:00']
    );
  }

  const patients = [
    ['Rahim Uddin', '1985-03-15', 'Male', 'A+', '01812000001', 'rahim@gmail.com', '12 Dhanmondi, Dhaka', 'Karim Uddin', '01812000011'],
    ['Sultana Begum', '1990-07-22', 'Female', 'B+', '01812000002', 'sultana@gmail.com', '45 Gulshan, Dhaka', 'Jamal Ahmed', '01812000012'],
    ['Faruk Hasan', '1978-11-08', 'Male', 'O+', '01812000003', 'faruk@gmail.com', '78 Uttara, Dhaka', 'Nasima Hasan', '01812000013'],
    ['Nasreen Akter', '1995-01-30', 'Female', 'AB+', '01812000004', 'nasreen@gmail.com', '23 Mirpur, Dhaka', 'Kamal Akter', '01812000014'],
    ['Abdul Kadir', '1970-06-19', 'Male', 'A-', '01812000005', 'kadir@gmail.com', '56 Banani, Dhaka', 'Mina Kadir', '01812000015'],
    ['Tahmina Islam', '1988-09-12', 'Female', 'O-', '01812000006', 'tahmina@gmail.com', '89 Mohammadpur, Dhaka', 'Iqbal Islam', '01812000016'],
    ['Hasan Mahmud', '2000-04-25', 'Male', 'B-', '01812000007', 'hasan@gmail.com', '34 Tejgaon, Dhaka', 'Rubina Mahmud', '01812000017'],
    ['Marium Khan', '1993-12-05', 'Female', 'A+', '01812000008', 'marium@gmail.com', '67 Bashundhara, Dhaka', 'Zahir Khan', '01812000018'],
    ['Jakir Hossain', '1982-08-17', 'Male', 'AB-', '01812000009', 'jakir@gmail.com', '90 Khilgaon, Dhaka', 'Salma Hossain', '01812000019'],
    ['Ruma Akter', '1998-05-03', 'Female', 'O+', '01812000010', 'ruma@gmail.com', '11 Rampura, Dhaka', 'Habib Akter', '01812000020']
  ];
  for (const patient of patients) {
    await db.query(
      'INSERT INTO patients (name, date_of_birth, gender, blood_group, phone, email, address, emergency_contact_name, emergency_contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      patient
    );
  }

  const rooms = [
    ['101', 'General', 1, 4, 2, 1500, 'Available'],
    ['102', 'General', 1, 4, 4, 1500, 'Occupied'],
    ['103', 'General', 1, 4, 0, 1500, 'Available'],
    ['201', 'Private', 2, 1, 1, 5000, 'Occupied'],
    ['202', 'Private', 2, 1, 0, 5000, 'Available'],
    ['203', 'Private', 2, 1, 0, 5000, 'Maintenance'],
    ['301', 'ICU', 3, 2, 1, 10000, 'Available'],
    ['302', 'ICU', 3, 2, 2, 10000, 'Occupied'],
    ['303', 'ICU', 3, 2, 0, 10000, 'Available'],
    ['E01', 'Emergency', 1, 6, 3, 3000, 'Available'],
    ['E02', 'Emergency', 1, 6, 0, 3000, 'Available'],
    ['104', 'General', 1, 4, 0, 1500, 'Available']
  ];
  for (const room of rooms) {
    await db.query(
      'INSERT INTO rooms (room_number, type, floor, capacity, occupied_beds, rate_per_day, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      room
    );
  }

  const admissions = [
    [1, 1, 1, '2026-04-01', null, 'Chest pain - under observation', null, 'Admitted'],
    [2, 1, 5, '2026-04-02', null, 'High fever and fatigue', null, 'Admitted'],
    [3, 4, 3, '2026-04-03', null, 'Fractured right arm', null, 'Admitted'],
    [4, 7, 2, '2026-04-01', null, 'Severe migraine - neurological evaluation', null, 'Admitted'],
    [5, 10, 6, '2026-03-30', null, 'Emergency admission - accident trauma', null, 'Admitted'],
    [6, 2, 1, '2026-03-25', '2026-03-30', 'Cardiac arrhythmia', 'Patient responded well. Discharged with follow-up.', 'Discharged'],
    [7, 2, 5, '2026-03-20', '2026-03-28', 'Pneumonia', 'Full recovery after antibiotic treatment.', 'Discharged']
  ];
  for (const admission of admissions) {
    await db.query(
      'INSERT INTO admissions (patient_id, room_id, doctor_id, admit_date, discharge_date, diagnosis, discharge_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      admission
    );
  }

  const medicalRecords = [
    [1, 1, '2026-04-01', 'Chest pain', 'ECG, blood tests ordered', 'Aspirin 75mg, Atorvastatin 10mg', 'History of hypertension'],
    [1, 1, '2026-04-03', 'Mild angina', 'Angiography recommended', 'Nitroglycerin as needed', 'Stable, monitoring continues'],
    [2, 5, '2026-04-02', 'Viral fever', 'Symptomatic treatment', 'Paracetamol 500mg, ORS', 'Hydration advised'],
    [3, 3, '2026-04-03', 'Fracture radius', 'Cast applied, surgical review pending', 'Ibuprofen 400mg, Calcium supplements', 'X-ray confirms clean fracture'],
    [4, 2, '2026-04-01', 'Chronic migraine', 'MRI brain ordered', 'Sumatriptan 50mg, Amitriptyline 10mg', 'Recurring episodes for 6 months'],
    [5, 6, '2026-03-30', 'Multiple contusions', 'CT scan, wound cleaning', 'Morphine, Tetanus booster', 'Road accident victim, stable'],
    [6, 1, '2026-03-25', 'Cardiac arrhythmia', 'Cardioversion performed', 'Amiodarone 200mg, Warfarin 5mg', 'Follow-up in 2 weeks'],
    [7, 5, '2026-03-20', 'Pneumonia', 'IV antibiotics started', 'Azithromycin 500mg, Cough syrup', 'Right lower lobe consolidation']
  ];
  for (const record of medicalRecords) {
    await db.query(
      'INSERT INTO medical_records (patient_id, doctor_id, record_date, diagnosis, treatment, prescription, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      record
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const appointments = [
    [8, 1, today, '10:00', 'Scheduled', 'Routine cardiac checkup'],
    [9, 2, today, '11:00', 'Scheduled', 'Headache consultation'],
    [10, 4, today, '14:00', 'Scheduled', 'Child vaccination'],
    [6, 1, tomorrow, '09:00', 'Scheduled', 'Post-discharge follow-up'],
    [7, 5, tomorrow, '10:30', 'Scheduled', 'Pneumonia follow-up'],
    [8, 3, tomorrow, '15:00', 'Scheduled', 'Knee pain evaluation']
  ];
  for (const appointment of appointments) {
    await db.query(
      'INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status, reason) VALUES (?, ?, ?, ?, ?, ?)',
      appointment
    );
  }

  const billingRows = [
    [6, 6, 25000, 25000, 'Card', 'Paid', '2026-03-30', '2026-04-15', 'Cardiac treatment - 5 days'],
    [7, 7, 32000, 20000, 'Cash', 'Partial', '2026-03-28', '2026-04-10', 'Pneumonia - 8 days'],
    [1, 1, 15000, 0, null, 'Pending', '2026-04-01', '2026-04-20', 'Ongoing cardiac evaluation'],
    [3, 3, 45000, 0, null, 'Pending', '2026-04-03', '2026-04-25', 'Fracture treatment']
  ];
  for (const bill of billingRows) {
    await db.query(
      'INSERT INTO billing (patient_id, admission_id, total_amount, paid_amount, payment_method, status, billing_date, due_date, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      bill
    );
  }

  const staffRows = [
    ['Anwar Hossain', 'Head Nurse', 1, '01911000001', 'anwar.staff@skycare.com', '2020-01-15', 'Active'],
    ['Reshma Begum', 'Nurse', 5, '01911000002', 'reshma@skycare.com', '2021-06-20', 'Active'],
    ['Kabir Mia', 'Lab Technician', 5, '01911000003', 'kabir@skycare.com', '2019-03-10', 'Active'],
    ['Sumi Akter', 'Pharmacist', null, '01911000004', 'sumi@skycare.com', '2022-01-05', 'Active'],
    ['Belal Ahmed', 'Receptionist', null, '01911000005', 'belal.staff@skycare.com', '2023-08-12', 'Active'],
    ['Nadia Islam', 'Nurse', 6, '01911000006', 'nadia@skycare.com', '2021-11-01', 'On Leave']
  ];
  for (const staff of staffRows) {
    await db.query(
      'INSERT INTO staff (name, role, department_id, phone, email, hire_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      staff
    );
  }

  const duties = [
    [1, 'Morning', 'Monday', 'Cardiology Ward'],
    [1, 'Morning', 'Tuesday', 'Cardiology Ward'],
    [1, 'Morning', 'Wednesday', 'ICU'],
    [2, 'Afternoon', 'Monday', 'General Ward'],
    [2, 'Afternoon', 'Tuesday', 'General Ward'],
    [2, 'Night', 'Wednesday', 'Emergency'],
    [3, 'Morning', 'Monday', 'Laboratory'],
    [3, 'Morning', 'Tuesday', 'Laboratory'],
    [4, 'Morning', 'Monday', 'Pharmacy'],
    [4, 'Morning', 'Tuesday', 'Pharmacy'],
    [5, 'Morning', 'Monday', 'Reception'],
    [5, 'Afternoon', 'Monday', 'Reception'],
    [6, 'Night', 'Monday', 'Emergency'],
    [6, 'Night', 'Tuesday', 'Emergency']
  ];
  for (const duty of duties) {
    await db.query(
      'INSERT INTO staff_duties (staff_id, shift, day_of_week, assigned_area) VALUES (?, ?, ?, ?)',
      duty
    );
  }

  const donations = [
    ['Rahim Uddin', 1, 'A+', 2, '2026-03-15', '2026-06-15', 'Available'],
    ['Faruk Hasan', 3, 'O+', 1, '2026-03-20', '2026-06-20', 'Available'],
    ['Ruma Akter', 10, 'O+', 2, '2026-03-22', '2026-06-22', 'Available'],
    ['Volunteer - Kamrul', null, 'B+', 3, '2026-03-25', '2026-06-25', 'Available'],
    ['Volunteer - Shafiq', null, 'AB+', 1, '2026-03-28', '2026-06-28', 'Available'],
    ['Volunteer - Naima', null, 'A-', 2, '2026-03-30', '2026-06-30', 'Available'],
    ['Sultana Begum', 2, 'B+', 1, '2026-02-10', '2026-05-10', 'Used'],
    ['Volunteer - Rasel', null, 'O-', 1, '2026-03-18', '2026-06-18', 'Available']
  ];
  for (const donation of donations) {
    await db.query(
      'INSERT INTO blood_donations (donor_name, patient_id, blood_group, units, donation_date, expiry_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      donation
    );
  }

  console.log('[SkyCare] Sample data seeded');
}

module.exports = { db, initializeDatabase };