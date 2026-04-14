
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

function resolveWritableDataDir() {
  const requestedDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null;
  const candidates = [requestedDir, '/tmp/skycare-data', __dirname].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.accessSync(dir, fs.constants.W_OK);
      return { dir, requestedDir };
    } catch (_) {
      // Try next candidate.
    }
  }

  throw new Error('No writable data directory available. Check DATA_DIR and service disk settings.');
}

const resolved = resolveWritableDataDir();
const dataDir = resolved.dir;

if (resolved.requestedDir && resolved.requestedDir !== dataDir) {
  console.warn(`[SkyCare] DATA_DIR is not writable (${resolved.requestedDir}). Falling back to ${dataDir}.`);
}

const dbPath = path.join(dataDir, 'skycare.db');
const bundledDbPath = path.join(__dirname, 'skycare.db');

// First boot on Render: preserve existing seeded/local data by copying bundled DB if persistent DB is missing.
if (!fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
  fs.copyFileSync(bundledDbPath, dbPath);
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

function initializeDatabase() {
  db.exec(`
    -- ═══ AUTH TABLES ═══
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL CHECK(role IN ('Admin','Senior Doctor','Junior Doctor','Nurse','Staff')),
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
      avatar_url TEXT,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT,
      resource_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- ═══ CORE TABLES ═══
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      head_doctor_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialization TEXT NOT NULL,
      qualification TEXT,
      experience_years INTEGER DEFAULT 0,
      phone TEXT,
      email TEXT UNIQUE,
      department_id INTEGER,
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active','On Leave','Inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS doctor_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      day_of_week TEXT NOT NULL CHECK(day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date_of_birth DATE,
      gender TEXT CHECK(gender IN ('Male','Female','Other')),
      blood_group TEXT CHECK(blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
      phone TEXT,
      email TEXT,
      address TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('General','Private','ICU','Emergency')),
      floor INTEGER NOT NULL DEFAULT 1,
      capacity INTEGER NOT NULL DEFAULT 1,
      occupied_beds INTEGER NOT NULL DEFAULT 0,
      rate_per_day REAL DEFAULT 0,
      status TEXT DEFAULT 'Available' CHECK(status IN ('Available','Occupied','Maintenance')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      room_id INTEGER,
      doctor_id INTEGER,
      admit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      discharge_date DATETIME,
      diagnosis TEXT,
      discharge_summary TEXT,
      status TEXT DEFAULT 'Admitted' CHECK(status IN ('Admitted','Discharged','Transferred')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER,
      record_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      diagnosis TEXT NOT NULL,
      treatment TEXT,
      prescription TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      appointment_date DATE NOT NULL,
      appointment_time TEXT NOT NULL,
      status TEXT DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Completed','Cancelled','No Show')),
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS billing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      admission_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending','Partial','Paid','Overdue')),
      billing_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      due_date DATE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department_id INTEGER,
      phone TEXT,
      email TEXT,
      hire_date DATE DEFAULT CURRENT_DATE,
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active','On Leave','Inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS staff_duties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      shift TEXT NOT NULL CHECK(shift IN ('Morning','Afternoon','Night')),
      day_of_week TEXT NOT NULL CHECK(day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
      assigned_area TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blood_donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      donor_name TEXT NOT NULL,
      patient_id INTEGER,
      blood_group TEXT NOT NULL CHECK(blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
      units REAL NOT NULL DEFAULT 1,
      donation_date DATE DEFAULT CURRENT_DATE,
      expiry_date DATE,
      status TEXT DEFAULT 'Available' CHECK(status IN ('Available','Used','Expired','Discarded')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
    );

    -- ═══ INDEXES ═══
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
    CREATE INDEX IF NOT EXISTS idx_patients_blood ON patients(blood_group);
    CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(name);
    CREATE INDEX IF NOT EXISTS idx_doctors_dept ON doctors(department_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
    CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
    CREATE INDEX IF NOT EXISTS idx_blood_group ON blood_donations(blood_group);
    CREATE INDEX IF NOT EXISTS idx_blood_status ON blood_donations(status);
  `);

  seedUsers();
  resetInsecureDefaultPasswords();
  seedData();

  // Migration: add avatar_url column if missing (for existing databases)
  try { db.prepare("SELECT avatar_url FROM users LIMIT 1").get(); } catch(e) {
    try { db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT"); } catch(e2) {}
  }
}

function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return;
  console.log('🔐 Seeding user accounts...');
  const ins = db.prepare('INSERT INTO users (username, password_hash, full_name, email, role) VALUES (?,?,?,?,?)');
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  ins.run('admin', hash(SEED_PASSWORDS.admin), 'System Administrator', 'admin@skycare.com', 'Admin');
  ins.run('dr.ayesha', hash(SEED_PASSWORDS['dr.ayesha']), 'Dr. Ayesha Rahman', 'ayesha@skycare.com', 'Senior Doctor');
  ins.run('dr.rafi', hash(SEED_PASSWORDS['dr.rafi']), 'Dr. Rafi Ahmed', 'rafi@skycare.com', 'Junior Doctor');
  ins.run('nurse.anwar', hash(SEED_PASSWORDS['nurse.anwar']), 'Anwar Hossain', 'anwar@skycare.com', 'Nurse');
  ins.run('staff.belal', hash(SEED_PASSWORDS['staff.belal']), 'Belal Ahmed', 'belal@skycare.com', 'Staff');
  console.log('✅ Users seeded');
}

function resetInsecureDefaultPasswords() {
  const selectUser = db.prepare('SELECT id, password_hash FROM users WHERE username = ?');
  const updatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const deleteSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const updatedUsers = [];

  for (const [username, weakPassword] of Object.entries(LEGACY_WEAK_PASSWORDS)) {
    const user = selectUser.get(username);
    if (!user) continue;

    if (!bcrypt.compareSync(weakPassword, user.password_hash)) {
      continue;
    }

    const nextPassword = SEED_PASSWORDS[username];
    updatePassword.run(bcrypt.hashSync(nextPassword, 10), user.id);
    deleteSessions.run(user.id);
    updatedUsers.push(username);
  }

  if (updatedUsers.length) {
    console.warn(`[SkyCare] Reset weak default passwords for: ${updatedUsers.join(', ')}.`);
    console.warn('[SkyCare] Set SKYCARE_*_PASSWORD environment variables in production.');
  }
}

function seedData() {
  const count = db.prepare('SELECT COUNT(*) as c FROM departments').get().c;
  if (count > 0) return;
  console.log('🌱 Seeding database...');

  const insDept = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
  [['Cardiology','Heart and cardiovascular system'],['Neurology','Brain and nervous system'],
   ['Orthopedics','Bones, joints, and muscles'],['Pediatrics','Medical care for infants and children'],
   ['General Medicine','Primary healthcare and general treatment'],['Emergency','Emergency and trauma care']
  ].forEach(d => insDept.run(...d));

  const insDoc = db.prepare('INSERT INTO doctors (name,specialization,qualification,experience_years,phone,email,department_id,status) VALUES (?,?,?,?,?,?,?,?)');
  [['Dr. Ayesha Rahman','Cardiologist','MBBS, MD Cardiology',12,'01711000001','dr.ayesha@hospital.com',1,'Active'],
   ['Dr. Karim Hossain','Neurologist','MBBS, MD Neurology',15,'01711000002','karim@hospital.com',2,'Active'],
   ['Dr. Fatima Noor','Orthopedic Surgeon','MBBS, MS Orthopedics',10,'01711000003','fatima@hospital.com',3,'Active'],
   ['Dr. Rafi Ahmed','Pediatrician','MBBS, DCH',8,'01711000004','dr.rafi@hospital.com',4,'Active'],
   ['Dr. Nusrat Jahan','General Physician','MBBS',5,'01711000005','nusrat@hospital.com',5,'Active'],
   ['Dr. Tanvir Islam','Emergency Medicine','MBBS, FCPS',14,'01711000006','tanvir@hospital.com',6,'Active'],
   ['Dr. Sadia Kabir','Cardiologist','MBBS, MD Cardiology',9,'01711000007','sadia@hospital.com',1,'Active'],
   ['Dr. Imran Chowdhury','Neurologist','MBBS, FCPS Neurology',11,'01711000008','imran@hospital.com',2,'On Leave']
  ].forEach(d => insDoc.run(...d));

  for (let i = 1; i <= 6; i++) db.prepare('UPDATE departments SET head_doctor_id = ? WHERE id = ?').run(i, i);

  const insSch = db.prepare('INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time) VALUES (?,?,?,?)');
  for (let did = 1; did <= 8; did++) {
    ['Monday','Tuesday','Wednesday','Thursday','Friday'].forEach(d => insSch.run(did, d, '09:00', '17:00'));
    insSch.run(did, 'Saturday', '09:00', '13:00');
  }

  const insPat = db.prepare('INSERT INTO patients (name,date_of_birth,gender,blood_group,phone,email,address,emergency_contact_name,emergency_contact_phone) VALUES (?,?,?,?,?,?,?,?,?)');
  [['Rahim Uddin','1985-03-15','Male','A+','01812000001','rahim@gmail.com','12 Dhanmondi, Dhaka','Karim Uddin','01812000011'],
   ['Sultana Begum','1990-07-22','Female','B+','01812000002','sultana@gmail.com','45 Gulshan, Dhaka','Jamal Ahmed','01812000012'],
   ['Faruk Hasan','1978-11-08','Male','O+','01812000003','faruk@gmail.com','78 Uttara, Dhaka','Nasima Hasan','01812000013'],
   ['Nasreen Akter','1995-01-30','Female','AB+','01812000004','nasreen@gmail.com','23 Mirpur, Dhaka','Kamal Akter','01812000014'],
   ['Abdul Kadir','1970-06-19','Male','A-','01812000005','kadir@gmail.com','56 Banani, Dhaka','Mina Kadir','01812000015'],
   ['Tahmina Islam','1988-09-12','Female','O-','01812000006','tahmina@gmail.com','89 Mohammadpur, Dhaka','Iqbal Islam','01812000016'],
   ['Hasan Mahmud','2000-04-25','Male','B-','01812000007','hasan@gmail.com','34 Tejgaon, Dhaka','Rubina Mahmud','01812000017'],
   ['Marium Khan','1993-12-05','Female','A+','01812000008','marium@gmail.com','67 Bashundhara, Dhaka','Zahir Khan','01812000018'],
   ['Jakir Hossain','1982-08-17','Male','AB-','01812000009','jakir@gmail.com','90 Khilgaon, Dhaka','Salma Hossain','01812000019'],
   ['Ruma Akter','1998-05-03','Female','O+','01812000010','ruma@gmail.com','11 Rampura, Dhaka','Habib Akter','01812000020']
  ].forEach(p => insPat.run(...p));

  const insRoom = db.prepare('INSERT INTO rooms (room_number,type,floor,capacity,occupied_beds,rate_per_day,status) VALUES (?,?,?,?,?,?,?)');
  [['101','General',1,4,2,1500,'Available'],['102','General',1,4,4,1500,'Occupied'],['103','General',1,4,0,1500,'Available'],
   ['201','Private',2,1,1,5000,'Occupied'],['202','Private',2,1,0,5000,'Available'],['203','Private',2,1,0,5000,'Maintenance'],
   ['301','ICU',3,2,1,10000,'Available'],['302','ICU',3,2,2,10000,'Occupied'],['303','ICU',3,2,0,10000,'Available'],
   ['E01','Emergency',1,6,3,3000,'Available'],['E02','Emergency',1,6,0,3000,'Available'],['104','General',1,4,0,1500,'Available']
  ].forEach(r => insRoom.run(...r));

  const insAdm = db.prepare('INSERT INTO admissions (patient_id,room_id,doctor_id,admit_date,discharge_date,diagnosis,discharge_summary,status) VALUES (?,?,?,?,?,?,?,?)');
  [[1,1,1,'2026-04-01',null,'Chest pain - under observation',null,'Admitted'],
   [2,1,5,'2026-04-02',null,'High fever and fatigue',null,'Admitted'],
   [3,4,3,'2026-04-03',null,'Fractured right arm',null,'Admitted'],
   [4,7,2,'2026-04-01',null,'Severe migraine - neurological evaluation',null,'Admitted'],
   [5,10,6,'2026-03-30',null,'Emergency admission - accident trauma',null,'Admitted'],
   [6,2,1,'2026-03-25','2026-03-30','Cardiac arrhythmia','Patient responded well. Discharged with follow-up.','Discharged'],
   [7,2,5,'2026-03-20','2026-03-28','Pneumonia','Full recovery after antibiotic treatment.','Discharged']
  ].forEach(a => insAdm.run(...a));

  const insRec = db.prepare('INSERT INTO medical_records (patient_id,doctor_id,record_date,diagnosis,treatment,prescription,notes) VALUES (?,?,?,?,?,?,?)');
  [[1,1,'2026-04-01','Chest pain','ECG, blood tests ordered','Aspirin 75mg, Atorvastatin 10mg','History of hypertension'],
   [1,1,'2026-04-03','Mild angina','Angiography recommended','Nitroglycerin as needed','Stable, monitoring continues'],
   [2,5,'2026-04-02','Viral fever','Symptomatic treatment','Paracetamol 500mg, ORS','Hydration advised'],
   [3,3,'2026-04-03','Fracture radius','Cast applied, surgical review pending','Ibuprofen 400mg, Calcium supplements','X-ray confirms clean fracture'],
   [4,2,'2026-04-01','Chronic migraine','MRI brain ordered','Sumatriptan 50mg, Amitriptyline 10mg','Recurring episodes for 6 months'],
   [5,6,'2026-03-30','Multiple contusions','CT scan, wound cleaning','Morphine, Tetanus booster','Road accident victim, stable'],
   [6,1,'2026-03-25','Cardiac arrhythmia','Cardioversion performed','Amiodarone 200mg, Warfarin 5mg','Follow-up in 2 weeks'],
   [7,5,'2026-03-20','Pneumonia','IV antibiotics started','Azithromycin 500mg, Cough syrup','Right lower lobe consolidation']
  ].forEach(r => insRec.run(...r));

  const insAppt = db.prepare('INSERT INTO appointments (patient_id,doctor_id,appointment_date,appointment_time,status,reason) VALUES (?,?,?,?,?,?)');
  const today = new Date().toISOString().split('T')[0];
  const tmr = new Date(Date.now()+86400000).toISOString().split('T')[0];
  [[8,1,today,'10:00','Scheduled','Routine cardiac checkup'],[9,2,today,'11:00','Scheduled','Headache consultation'],
   [10,4,today,'14:00','Scheduled','Child vaccination'],[6,1,tmr,'09:00','Scheduled','Post-discharge follow-up'],
   [7,5,tmr,'10:30','Scheduled','Pneumonia follow-up'],[8,3,tmr,'15:00','Scheduled','Knee pain evaluation']
  ].forEach(a => insAppt.run(...a));

  const insBill = db.prepare('INSERT INTO billing (patient_id,admission_id,total_amount,paid_amount,payment_method,status,billing_date,due_date,description) VALUES (?,?,?,?,?,?,?,?,?)');
  [[6,6,25000,25000,'Card','Paid','2026-03-30','2026-04-15','Cardiac treatment - 5 days'],
   [7,7,32000,20000,'Cash','Partial','2026-03-28','2026-04-10','Pneumonia - 8 days'],
   [1,1,15000,0,null,'Pending','2026-04-01','2026-04-20','Ongoing cardiac evaluation'],
   [3,3,45000,0,null,'Pending','2026-04-03','2026-04-25','Fracture treatment']
  ].forEach(b => insBill.run(...b));

  const insStaff = db.prepare('INSERT INTO staff (name,role,department_id,phone,email,hire_date,status) VALUES (?,?,?,?,?,?,?)');
  [['Anwar Hossain','Head Nurse',1,'01911000001','anwar.staff@skycare.com','2020-01-15','Active'],
   ['Reshma Begum','Nurse',5,'01911000002','reshma@skycare.com','2021-06-20','Active'],
   ['Kabir Mia','Lab Technician',5,'01911000003','kabir@skycare.com','2019-03-10','Active'],
   ['Sumi Akter','Pharmacist',null,'01911000004','sumi@skycare.com','2022-01-05','Active'],
   ['Belal Ahmed','Receptionist',null,'01911000005','belal.staff@skycare.com','2023-08-12','Active'],
   ['Nadia Islam','Nurse',6,'01911000006','nadia@skycare.com','2021-11-01','On Leave']
  ].forEach(s => insStaff.run(...s));

  const insDuty = db.prepare('INSERT INTO staff_duties (staff_id,shift,day_of_week,assigned_area) VALUES (?,?,?,?)');
  [[1,'Morning','Monday','Cardiology Ward'],[1,'Morning','Tuesday','Cardiology Ward'],[1,'Morning','Wednesday','ICU'],
   [2,'Afternoon','Monday','General Ward'],[2,'Afternoon','Tuesday','General Ward'],[2,'Night','Wednesday','Emergency'],
   [3,'Morning','Monday','Laboratory'],[3,'Morning','Tuesday','Laboratory'],
   [4,'Morning','Monday','Pharmacy'],[4,'Morning','Tuesday','Pharmacy'],
   [5,'Morning','Monday','Reception'],[5,'Afternoon','Monday','Reception'],
   [6,'Night','Monday','Emergency'],[6,'Night','Tuesday','Emergency']
  ].forEach(d => insDuty.run(...d));

  const insBlood = db.prepare('INSERT INTO blood_donations (donor_name,patient_id,blood_group,units,donation_date,expiry_date,status) VALUES (?,?,?,?,?,?,?)');
  [['Rahim Uddin',1,'A+',2,'2026-03-15','2026-06-15','Available'],
   ['Faruk Hasan',3,'O+',1,'2026-03-20','2026-06-20','Available'],
   ['Ruma Akter',10,'O+',2,'2026-03-22','2026-06-22','Available'],
   ['Volunteer - Kamrul',null,'B+',3,'2026-03-25','2026-06-25','Available'],
   ['Volunteer - Shafiq',null,'AB+',1,'2026-03-28','2026-06-28','Available'],
   ['Volunteer - Naima',null,'A-',2,'2026-03-30','2026-06-30','Available'],
   ['Sultana Begum',2,'B+',1,'2026-02-10','2026-05-10','Used'],
   ['Volunteer - Rasel',null,'O-',1,'2026-03-18','2026-06-18','Available']
  ].forEach(b => insBlood.run(...b));

  console.log('✅ Database seeded with sample data');
}

module.exports = { db, initializeDatabase, dataDir };
