CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(140) NOT NULL,
  email VARCHAR(190),
  role ENUM('Admin','Senior Doctor','Junior Doctor','Nurse','Staff') NOT NULL,
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  avatar_url TEXT,
  last_login DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(80) NOT NULL,
  resource VARCHAR(120),
  resource_id INT,
  details TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  head_doctor_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS doctors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  specialization VARCHAR(120) NOT NULL,
  qualification VARCHAR(190),
  experience_years INT NOT NULL DEFAULT 0,
  phone VARCHAR(40),
  email VARCHAR(190) UNIQUE,
  department_id INT,
  status ENUM('Active','On Leave','Inactive') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_doctors_name (name),
  KEY idx_doctors_dept (department_id),
  CONSTRAINT fk_doctors_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS doctor_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  start_time VARCHAR(20) NOT NULL,
  end_time VARCHAR(20) NOT NULL,
  CONSTRAINT fk_doctor_schedules_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  date_of_birth DATE,
  gender ENUM('Male','Female','Other'),
  blood_group ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-'),
  phone VARCHAR(40),
  email VARCHAR(190),
  address TEXT,
  emergency_contact_name VARCHAR(140),
  emergency_contact_phone VARCHAR(40),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_patients_name (name),
  KEY idx_patients_blood (blood_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_number VARCHAR(40) NOT NULL UNIQUE,
  type ENUM('General','Private','ICU','Emergency') NOT NULL,
  floor INT NOT NULL DEFAULT 1,
  capacity INT NOT NULL DEFAULT 1,
  occupied_beds INT NOT NULL DEFAULT 0,
  rate_per_day DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('Available','Occupied','Maintenance') NOT NULL DEFAULT 'Available',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rooms_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  room_id INT,
  doctor_id INT,
  admit_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discharge_date DATETIME,
  diagnosis TEXT,
  discharge_summary TEXT,
  status ENUM('Admitted','Discharged','Transferred') NOT NULL DEFAULT 'Admitted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admissions_status (status),
  CONSTRAINT fk_admissions_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_admissions_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
  CONSTRAINT fk_admissions_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS medical_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT,
  record_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diagnosis TEXT NOT NULL,
  treatment TEXT,
  prescription TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_medical_records_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_medical_records_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time VARCHAR(20) NOT NULL,
  status ENUM('Scheduled','Completed','Cancelled','No Show') NOT NULL DEFAULT 'Scheduled',
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_appointments_date (appointment_date),
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  admission_id INT,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(40),
  status ENUM('Pending','Partial','Paid','Overdue') NOT NULL DEFAULT 'Pending',
  billing_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date DATE,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_admission FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  role VARCHAR(120) NOT NULL,
  department_id INT,
  phone VARCHAR(40),
  email VARCHAR(190),
  hire_date DATE DEFAULT CURRENT_DATE,
  status ENUM('Active','On Leave','Inactive') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff_duties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  shift ENUM('Morning','Afternoon','Night') NOT NULL,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  assigned_area VARCHAR(190),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_duties_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blood_donations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donor_name VARCHAR(140) NOT NULL,
  patient_id INT,
  blood_group ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  units DECIMAL(8,2) NOT NULL DEFAULT 1,
  donation_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE,
  status ENUM('Available','Used','Expired','Discarded') NOT NULL DEFAULT 'Available',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_blood_group (blood_group),
  KEY idx_blood_status (status),
  CONSTRAINT fk_blood_donations_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL,
  entity_id INT NOT NULL,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(190),
  suggested_role ENUM('Admin','Senior Doctor','Junior Doctor','Nurse','Staff') NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
