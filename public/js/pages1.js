const DASHBOARD_METRIC_LABELS = {
  totalPatients: 'Total Patients',
  totalDoctors: 'Active Doctors',
  availableRooms: 'Available Rooms',
  totalRooms: 'Total Rooms',
  activeAdmissions: 'Active Admissions',
  todayAppointments: "Today's Appointments",
  pendingBills: 'Pending Bills',
  bloodUnits: 'Blood Units Available',
  totalStaff: 'Active Staff',
  totalUsers: 'Total System Users'
};

function downloadDashboardReport() {
  const data = window._dashboardReportData;
  if (!data || !data.stats) {
    showToast('Dashboard data is not ready yet', 'error');
    return;
  }
  const rows = Object.entries(data.stats).map(([key, value]) => ({
    metric: DASHBOARD_METRIC_LABELS[key] || key,
    value: value
  }));
  downloadReportPdf({
    title: 'Dashboard Summary Report',
    subtitle: 'Operational snapshot of current visible modules',
    filename: 'dashboard-summary-report.pdf',
    columns: [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value' }
    ],
    rows,
    meta: [
      { label: 'Recent Admissions', value: (data.recentAdmissions || []).length },
      { label: "Today's Appointments", value: (data.todayAppointments || []).length },
      { label: 'Blood Groups Tracked', value: (data.bloodSummary || []).length }
    ]
  });
}

function downloadDepartmentsReport() {
  downloadReportPdf({
    title: 'Department Report',
    subtitle: 'Department directory and assigned leadership',
    filename: 'departments-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Department Name' },
      { key: 'description', label: 'Description' },
      { key: 'head_doctor_name', label: 'Head Doctor' }
    ],
    rows: window._allDepartments || []
  });
}

function downloadDoctorsReport() {
  downloadReportPdf({
    title: 'Doctor Directory Report',
    subtitle: 'Doctor list with specialization and status',
    filename: 'doctors-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Doctor Name' },
      { key: 'specialization', label: 'Specialization' },
      { key: 'department_name', label: 'Department' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' }
    ],
    rows: window._allDoctors || []
  });
}

function downloadPatientsReport() {
  downloadReportPdf({
    title: 'Patient Report',
    subtitle: 'Patient directory and contact summary',
    filename: 'patients-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Patient Name' },
      { key: 'gender', label: 'Gender' },
      { key: 'blood_group', label: 'Blood Group' },
      { key: 'phone', label: 'Phone' },
      { key: 'date_of_birth', label: 'Date of Birth' }
    ],
    rows: window._allPatients || []
  });
}

function downloadRoomsReport() {
  downloadReportPdf({
    title: 'Room Occupancy Report',
    subtitle: 'Room availability and occupancy details',
    filename: 'rooms-report.pdf',
    columns: [
      { key: 'room_number', label: 'Room Number' },
      { key: 'type', label: 'Type' },
      { key: 'floor', label: 'Floor' },
      { key: 'capacity', label: 'Capacity' },
      { key: 'occupied_beds', label: 'Occupied Beds' },
      { key: 'rate_per_day', label: 'Rate/Day', pdfRender: (v) => asCurrency(v) },
      { key: 'status', label: 'Status' }
    ],
    rows: window._allRooms || []
  });
}

/* ── Dashboard Page ── */
async function renderDashboard() {
  try {
    const data = await API.get('/api/dashboard');
    window._dashboardReportData = data;
    const s = data.stats || {};
    const cards = [];

    if (s.totalPatients !== undefined) cards.push({ icon:'users', val:s.totalPatients, lbl:'Total Patients' });
    if (s.totalDoctors !== undefined) cards.push({ icon:'stethoscope', val:s.totalDoctors, lbl:'Active Doctors' });
    if (s.availableRooms !== undefined && s.totalRooms !== undefined) cards.push({ icon:'bed', val:`${s.availableRooms}/${s.totalRooms}`, lbl:'Available Rooms' });
    if (s.activeAdmissions !== undefined) cards.push({ icon:'clipboard', val:s.activeAdmissions, lbl:'Active Admissions' });
    if (s.todayAppointments !== undefined) cards.push({ icon:'calendar', val:s.todayAppointments, lbl:"Today's Appointments" });
    if (s.pendingBills !== undefined) cards.push({ icon:'creditCard', val:s.pendingBills, lbl:'Pending Bills' });
    if (s.bloodUnits !== undefined) cards.push({ icon:'droplets', val:s.bloodUnits, lbl:'Blood Units Available' });
    if (s.totalStaff !== undefined) cards.push({ icon:'usersRound', val:s.totalStaff, lbl:'Active Staff' });
    if (s.totalUsers !== undefined) cards.push({ icon:'shield', val:s.totalUsers, lbl:'Total System Users' });

    let html = `<div class="section-header"><h3 class="section-title">Executive Dashboard</h3><div class="section-actions">${reportBtn('downloadDashboardReport()', 'Dashboard PDF')}</div></div>`;
    html += cards.length
      ? `<div class="stats-grid">${cards.map(c => `
        <div class="stat-card"><div class="stat-card-header"><div class="stat-card-icon">${Icon(c.icon, 22)}</div></div>
        <div class="stat-card-value">${c.val}</div><div class="stat-card-label">${c.lbl}</div></div>`).join('')}</div>`
      : `<div class="empty-state"><div class="empty-state-icon">${Icon('shield', 44)}</div><p class="empty-state-text">No dashboard widgets are available for your role.</p></div>`;

    const panels = [];
    if (moduleCanRead('admissions')) {
      let panel = `<div class="panel"><div class="panel-header"><span class="panel-title">${Icon('clipboard',16)} Recent Admissions</span></div><div class="panel-body">`;
      panel += buildTable([{key:'patient_name',label:'Patient'},{key:'room_number',label:'Room'},{key:'doctor_name',label:'Doctor'},{key:'status',label:'Status',render:v=>statusBadge(v)}], data.recentAdmissions || [], null);
      panel += `</div></div>`;
      panels.push(panel);
    }

    if (moduleCanRead('appointments')) {
      let panel = `<div class="panel"><div class="panel-header"><span class="panel-title">${Icon('calendar',16)} Today's Appointments</span></div><div class="panel-body">`;
      panel += buildTable([{key:'patient_name',label:'Patient'},{key:'doctor_name',label:'Doctor'},{key:'appointment_time',label:'Time'},{key:'status',label:'Status',render:v=>statusBadge(v)}], data.todayAppointments || [], null);
      panel += `</div></div>`;
      panels.push(panel);
    }

    if (moduleCanRead('blood-donations')) {
      const summary = data.bloodSummary || [];
      let panel = `<div class="panel"><div class="panel-header"><span class="panel-title">${Icon('droplets',16)} Blood Bank Summary</span></div><div class="panel-body" style="padding:16px;"><div class="blood-grid">`;
      ['A+','A-','B+','B-','AB+','AB-','O+','O-'].forEach(g => {
        const found = summary.find(b => b.blood_group === g);
        panel += `<div class="blood-card"><div class="blood-card-group">${g}</div><div class="blood-card-units">${found?found.total_units:0} units</div></div>`;
      });
      panel += `</div></div></div>`;
      panels.push(panel);
    }

    if (panels.length) html += `<div class="dashboard-grid">${panels.join('')}</div>`;
    document.getElementById('pageContent').innerHTML = html;
  } catch (e) { showToast('Failed to load dashboard: ' + e.message, 'error'); }
}

/* ── Departments Page ── */
async function renderDepartments() {
  try {
    const depts = await API.get('/api/departments');
    window._allDepartments = depts;
    let html = `<div class="section-header"><h3 class="section-title">All Departments</h3><div class="section-actions">
      ${reportBtn('downloadDepartmentsReport()', 'Report PDF')}
      ${ifCanWrite('departments', `<button class="btn btn-primary" onclick="showDepartmentForm()">${Icon('plus',14)} Add Department</button>`)}</div></div>`;
    html += buildTable(
      [{key:'id',label:'ID'},{key:'name',label:'Name'},{key:'description',label:'Description'},{key:'head_doctor_name',label:'Head Doctor'}],
      depts,
      moduleCanWrite('departments') ? (row) => `${editBtn(`showDepartmentForm(${row.id})`)}${deleteBtn(`deleteDepartment(${row.id})`)}` : null
    );
    document.getElementById('pageContent').innerHTML = html;
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function showDepartmentForm(id) {
  let dept = { name:'', description:'', head_doctor_id:'' };
  if (id) try { dept = await API.get(`/api/departments/${id}`); } catch(e) {}
  let doctors = []; try { doctors = await API.get('/api/doctors'); } catch(e) {}
  openModal(id ? 'Edit Department' : 'Add Department', `<form id="deptForm">
    <div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" value="${dept.name||''}" required></div>
    <div class="form-group"><label class="form-label">Description</label><textarea name="description" class="form-control">${dept.description||''}</textarea></div>
    <div class="form-group"><label class="form-label">Head Doctor</label><select name="head_doctor_id" class="form-control">
      <option value="">Select Doctor</option>${doctors.map(d=>`<option value="${d.id}" ${dept.head_doctor_id==d.id?'selected':''}>${d.name}</option>`).join('')}
    </select></div></form>`, async () => {
    const data = getFormData('deptForm');
    if (!data.name) { showToast('Name is required','error'); return; }
    try { if(id) await API.put(`/api/departments/${id}`,data); else await API.post('/api/departments',data);
      closeModal(); showToast(id?'Department updated':'Department added','success'); renderDepartments(); } catch(e) { showToast(e.message,'error'); }
  });
}

async function deleteDepartment(id) {
  if (await confirmAction('Delete this department?')) {
    try { await API.del(`/api/departments/${id}`); showToast('Deleted','success'); renderDepartments(); } catch(e) { showToast(e.message,'error'); }
  }
}

/* ── Doctors Page ── */
async function renderDoctors() {
  try {
    const doctors = await API.get('/api/doctors');
    let html = `<div class="section-header"><h3 class="section-title">All Doctors</h3><div class="section-actions">
      ${searchBoxHtml('doctorSearch','Search doctors...','filterDoctors()')}
      ${reportBtn('downloadDoctorsReport()', 'Report PDF')}
      ${ifCanWrite('doctors', `<button class="btn btn-primary" onclick="showDoctorForm()">${Icon('plus',14)} Add Doctor</button>`)}</div></div>`;
    html += `<div id="doctorsTable">${buildDoctorsTable(doctors)}</div>`;
    document.getElementById('pageContent').innerHTML = html;
    window._allDoctors = doctors;
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

function buildDoctorsTable(doctors) {
  return buildTable(
    [{key:'id',label:'ID'},{key:'name',label:'Name'},{key:'specialization',label:'Specialization'},
     {key:'department_name',label:'Department'},{key:'phone',label:'Phone'},
     {key:'status',label:'Status',render:v=>statusBadge(v)}],
    doctors,
    (row) => `${scheduleBtn(`showDoctorSchedule(${row.id})`)}${moduleCanWrite('doctors') ? `${editBtn(`showDoctorForm(${row.id})`)}${deleteBtn(`deleteDoctor(${row.id})`)}` : ''}`
  );
}

function filterDoctors() {
  const q = document.getElementById('doctorSearch').value.toLowerCase();
  const filtered = (window._allDoctors||[]).filter(d => d.name.toLowerCase().includes(q)||(d.specialization||'').toLowerCase().includes(q));
  document.getElementById('doctorsTable').innerHTML = buildDoctorsTable(filtered);
}

async function showDoctorForm(id) {
  let doc = {name:'',specialization:'',qualification:'',experience_years:'',phone:'',email:'',department_id:'',status:'Active'};
  if (id) try { doc = await API.get(`/api/doctors/${id}`); } catch(e) {}
  let depts = []; try { depts = await API.get('/api/departments'); } catch(e) {}
  openModal(id?'Edit Doctor':'Add Doctor', `<form id="docForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" value="${doc.name||''}" required></div>
    <div class="form-group"><label class="form-label">Specialization *</label><input name="specialization" class="form-control" value="${doc.specialization||''}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Qualification</label><input name="qualification" class="form-control" value="${doc.qualification||''}"></div>
    <div class="form-group"><label class="form-label">Experience (years)</label><input name="experience_years" type="number" class="form-control" value="${doc.experience_years||''}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Phone</label><input name="phone" class="form-control" value="${doc.phone||''}"></div>
    <div class="form-group"><label class="form-label">Email</label><input name="email" type="email" class="form-control" value="${doc.email||''}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Department</label><select name="department_id" class="form-control">
      <option value="">Select</option>${depts.map(d=>`<option value="${d.id}" ${doc.department_id==d.id?'selected':''}>${d.name}</option>`).join('')}
    </select></div>
    <div class="form-group"><label class="form-label">Status</label><select name="status" class="form-control">
      ${['Active','On Leave','Inactive'].map(s=>`<option ${doc.status===s?'selected':''}>${s}</option>`).join('')}
    </select></div></div></form>`, async () => {
    const data = getFormData('docForm');
    if (!data.name) { showToast('Name is required','error'); return; }
    try { if(id) await API.put(`/api/doctors/${id}`,data); else await API.post('/api/doctors',data);
      closeModal(); showToast(id?'Updated':'Added','success'); renderDoctors(); } catch(e) { showToast(e.message,'error'); }
  });
}

async function showDoctorSchedule(id) {
  try {
    const schedules = await API.get(`/api/doctor-schedules/${id}`);
    const doc = await API.get(`/api/doctors/${id}`);
    let html = `<h4 style="margin-bottom:12px">${Icon('calendar',18)} ${doc.name} — Weekly Schedule</h4>`;
    html += buildTable([{key:'day_of_week',label:'Day'},{key:'start_time',label:'Start'},{key:'end_time',label:'End'}], schedules, null);
    openModal('Doctor Schedule', html, null);
  } catch(e) { showToast(e.message,'error'); }
}

async function deleteDoctor(id) {
  if (await confirmAction('Delete this doctor?')) {
    try { await API.del(`/api/doctors/${id}`); showToast('Deleted','success'); renderDoctors(); } catch(e) { showToast(e.message,'error'); }
  }
}

/* ── Patients Page ── */
async function renderPatients() {
  try {
    const patients = await API.get('/api/patients');
    let html = `<div class="section-header"><h3 class="section-title">All Patients</h3><div class="section-actions">
      ${searchBoxHtml('patientSearch','Search by name or blood group...','filterPatients()')}
      ${reportBtn('downloadPatientsReport()', 'Report PDF')}
      ${ifCanWrite('patients', `<button class="btn btn-primary" onclick="showPatientForm()">${Icon('plus',14)} Add Patient</button>`)}</div></div>`;
    html += `<div id="patientsTable">${buildPatientsTable(patients)}</div>`;
    document.getElementById('pageContent').innerHTML = html;
    window._allPatients = patients;
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

function buildPatientsTable(patients) {
  return buildTable(
    [{key:'id',label:'ID'},{key:'name',label:'Name'},{key:'gender',label:'Gender'},{key:'blood_group',label:'Blood Group',render:v=>v?badgeHtml(v,'danger'):'-'},
     {key:'phone',label:'Phone'},{key:'date_of_birth',label:'DOB'}],
    patients,
    (row) => {
      const history = moduleCanRead('medical-records') ? viewBtn(`viewPatientHistory(${row.id})`,'History') : '';
      const editAndDelete = moduleCanWrite('patients') ? `${editBtn(`showPatientForm(${row.id})`)}${deleteBtn(`deletePatient(${row.id})`)}` : '';
      return `${history}${editAndDelete}`;
    }
  );
}

function filterPatients() {
  const q = document.getElementById('patientSearch').value.toLowerCase();
  const f = (window._allPatients||[]).filter(p => p.name.toLowerCase().includes(q)||(p.blood_group||'').toLowerCase().includes(q));
  document.getElementById('patientsTable').innerHTML = buildPatientsTable(f);
}

async function showPatientForm(id) {
  let p = {name:'',date_of_birth:'',gender:'',blood_group:'',phone:'',email:'',address:'',emergency_contact_name:'',emergency_contact_phone:''};
  if(id) try{p=await API.get(`/api/patients/${id}`);}catch(e){}
  openModal(id?'Edit Patient':'Add Patient',`<form id="patForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" value="${p.name||''}"></div>
    <div class="form-group"><label class="form-label">Date of Birth</label><input name="date_of_birth" type="date" class="form-control" value="${p.date_of_birth||''}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Gender</label><select name="gender" class="form-control">
      <option value="">Select</option>${['Male','Female','Other'].map(g=>`<option ${p.gender===g?'selected':''}>${g}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Blood Group</label><select name="blood_group" class="form-control">
      <option value="">Select</option>${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b=>`<option ${p.blood_group===b?'selected':''}>${b}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Phone</label><input name="phone" class="form-control" value="${p.phone||''}"></div>
    <div class="form-group"><label class="form-label">Email</label><input name="email" type="email" class="form-control" value="${p.email||''}"></div></div>
    <div class="form-group"><label class="form-label">Address</label><textarea name="address" class="form-control">${p.address||''}</textarea></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Emergency Contact</label><input name="emergency_contact_name" class="form-control" value="${p.emergency_contact_name||''}"></div>
    <div class="form-group"><label class="form-label">Emergency Phone</label><input name="emergency_contact_phone" class="form-control" value="${p.emergency_contact_phone||''}"></div></div>
  </form>`, async()=>{
    const d=getFormData('patForm'); if(!d.name){showToast('Name required','error');return;}
    try{if(id)await API.put(`/api/patients/${id}`,d);else await API.post('/api/patients',d);
      closeModal();showToast(id?'Updated':'Added','success');renderPatients();}catch(e){showToast(e.message,'error');}
  });
}

async function viewPatientHistory(id) {
  try {
    const records = await API.get(`/api/medical-records?patient_id=${id}`);
    const p = await API.get(`/api/patients/${id}`);
    let html = `<h4 style="margin-bottom:12px">${Icon('folder',18)} ${p.name} — Medical History</h4>`;
    html += buildTable([{key:'record_date',label:'Date'},{key:'diagnosis',label:'Diagnosis'},{key:'treatment',label:'Treatment'},{key:'doctor_name',label:'Doctor'}],records,null);
    openModal('Patient History',html,null);
  } catch(e){showToast(e.message,'error');}
}

async function deletePatient(id) {
  if(await confirmAction('Delete this patient and all related records?')){
    try{await API.del(`/api/patients/${id}`);showToast('Deleted','success');renderPatients();}catch(e){showToast(e.message,'error');}
  }
}

/* ── Rooms Page ── */
async function renderRooms() {
  try {
    const rooms = await API.get('/api/rooms');
    window._allRooms = rooms;
    let html = `<div class="section-header"><h3 class="section-title">Room Management</h3><div class="section-actions">
      ${reportBtn('downloadRoomsReport()', 'Report PDF')}
      ${ifCanWrite('rooms', `<button class="btn btn-primary" onclick="showRoomForm()">${Icon('plus',14)} Add Room</button>`)}</div></div>`;
    html += `<div class="room-grid">`;
    rooms.forEach(r => {
      const cls = r.status.toLowerCase();
      html += `<div class="room-card ${cls}">
        <div class="room-card-number">${Icon('bed',16)} Room ${r.room_number}</div>
        <div class="room-card-type">${r.type} • Floor ${r.floor}</div>
        <div class="room-card-info"><span class="room-card-beds">${r.occupied_beds}/${r.capacity} beds</span>${statusBadge(r.status)}</div>
        <div style="margin-top:12px;display:flex;gap:6px">
          ${moduleCanWrite('rooms') ? `${editBtn(`showRoomForm(${r.id})`)}${deleteBtn(`deleteRoom(${r.id})`)}` : ''}
        </div></div>`;
    });
    html += `</div>`;
    document.getElementById('pageContent').innerHTML = html;
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function showRoomForm(id) {
  let r={room_number:'',type:'General',floor:1,capacity:1,occupied_beds:0,rate_per_day:0,status:'Available'};
  if(id) try{r=await API.get(`/api/rooms/${id}`);}catch(e){}
  openModal(id?'Edit Room':'Add Room',`<form id="roomForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Room Number *</label><input name="room_number" class="form-control" value="${r.room_number||''}"></div>
    <div class="form-group"><label class="form-label">Type</label><select name="type" class="form-control">
      ${['General','Private','ICU','Emergency'].map(t=>`<option ${r.type===t?'selected':''}>${t}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Floor</label><input name="floor" type="number" class="form-control" value="${r.floor||1}"></div>
    <div class="form-group"><label class="form-label">Capacity</label><input name="capacity" type="number" class="form-control" value="${r.capacity||1}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Occupied Beds</label><input name="occupied_beds" type="number" class="form-control" value="${r.occupied_beds||0}"></div>
    <div class="form-group"><label class="form-label">Rate/Day (৳)</label><input name="rate_per_day" type="number" class="form-control" value="${r.rate_per_day||0}"></div></div>
    <div class="form-group"><label class="form-label">Status</label><select name="status" class="form-control">
      ${['Available','Occupied','Maintenance'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
  </form>`,async()=>{
    const d=getFormData('roomForm');if(!d.room_number){showToast('Room number required','error');return;}
    try{if(id)await API.put(`/api/rooms/${id}`,d);else await API.post('/api/rooms',d);
      closeModal();showToast(id?'Updated':'Added','success');renderRooms();}catch(e){showToast(e.message,'error');}
  });
}

async function deleteRoom(id){
  if(await confirmAction('Delete this room?')){
    try{await API.del(`/api/rooms/${id}`);showToast('Deleted','success');renderRooms();}catch(e){showToast(e.message,'error');}
  }
}
