function downloadAdmissionsReport() {
  downloadReportPdf({
    title: 'Admissions Report',
    subtitle: 'Admission and discharge tracking summary',
    filename: 'admissions-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'patient_name', label: 'Patient' },
      { key: 'room_number', label: 'Room' },
      { key: 'doctor_name', label: 'Doctor' },
      { key: 'admit_date', label: 'Admit Date' },
      { key: 'discharge_date', label: 'Discharge Date' },
      { key: 'diagnosis', label: 'Diagnosis' },
      { key: 'status', label: 'Status' }
    ],
    rows: window._allAdmissions || []
  });
}

function downloadMedicalRecordsReport() {
  downloadReportPdf({
    title: 'Medical Records Report',
    subtitle: 'Clinical diagnosis and treatment records',
    filename: 'medical-records-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'patient_name', label: 'Patient' },
      { key: 'doctor_name', label: 'Doctor' },
      { key: 'record_date', label: 'Record Date' },
      { key: 'diagnosis', label: 'Diagnosis' },
      { key: 'treatment', label: 'Treatment' }
    ],
    rows: window._allRecords || []
  });
}

function downloadAppointmentsReport() {
  downloadReportPdf({
    title: 'Appointments Report',
    subtitle: 'Appointment schedule and status overview',
    filename: 'appointments-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'patient_name', label: 'Patient' },
      { key: 'doctor_name', label: 'Doctor' },
      { key: 'appointment_date', label: 'Date' },
      { key: 'appointment_time', label: 'Time' },
      { key: 'status', label: 'Status' },
      { key: 'reason', label: 'Reason' }
    ],
    rows: window._allAppointments || []
  });
}

function downloadBillingReport() {
  downloadReportPdf({
    title: 'Billing Report',
    subtitle: 'Billing totals, payments, and dues',
    filename: 'billing-report.pdf',
    columns: [
      { key: 'id', label: 'Bill ID' },
      { key: 'patient_name', label: 'Patient' },
      { key: 'description', label: 'Description' },
      { key: 'total_amount', label: 'Total Amount', pdfRender: (v) => asCurrency(v) },
      { key: 'paid_amount', label: 'Paid Amount', pdfRender: (v) => asCurrency(v) },
      { key: 'payment_method', label: 'Method' },
      { key: 'status', label: 'Status' },
      { key: 'billing_date', label: 'Billing Date' }
    ],
    rows: window._allBills || []
  });
}

function downloadBillInvoice(billId) {
  const bill = (window._allBills || []).find((item) => Number(item.id) === Number(billId));
  if (!bill) {
    showToast('Unable to find bill for invoice download', 'error');
    return;
  }
  downloadBillingInvoicePdf(bill);
}

function downloadStaffReport() {
  downloadReportPdf({
    title: 'Staff Report',
    subtitle: 'Staff directory and current status',
    filename: 'staff-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role' },
      { key: 'department_name', label: 'Department' },
      { key: 'phone', label: 'Phone' },
      { key: 'hire_date', label: 'Hire Date' },
      { key: 'status', label: 'Status' }
    ],
    rows: window._allStaff || []
  });
}

function downloadDutiesReport() {
  downloadReportPdf({
    title: 'Duty Roster Report',
    subtitle: 'Staff duty assignments by shift and day',
    filename: 'staff-duty-roster-report.pdf',
    columns: [
      { key: 'staff_name', label: 'Staff' },
      { key: 'staff_role', label: 'Role' },
      { key: 'shift', label: 'Shift' },
      { key: 'day_of_week', label: 'Day' },
      { key: 'assigned_area', label: 'Assigned Area' }
    ],
    rows: window._allDuties || []
  });
}

function downloadBloodBankReport() {
  downloadReportPdf({
    title: 'Blood Bank Report',
    subtitle: 'Blood inventory and donation status',
    filename: 'blood-bank-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'donor_name', label: 'Donor' },
      { key: 'blood_group', label: 'Blood Group' },
      { key: 'units', label: 'Units' },
      { key: 'donation_date', label: 'Donation Date' },
      { key: 'expiry_date', label: 'Expiry Date' },
      { key: 'status', label: 'Status' }
    ],
    rows: window._allDonations || []
  });
}

function downloadUsersReport() {
  downloadReportPdf({
    title: 'User Accounts Report',
    subtitle: 'System users and role assignments',
    filename: 'users-report.pdf',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'username', label: 'Username' },
      { key: 'full_name', label: 'Full Name' },
      { key: 'role', label: 'Role' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'last_login', label: 'Last Login' }
    ],
    rows: window._allUsers || []
  });
}

function downloadAuditLogReport() {
  downloadReportPdf({
    title: 'Audit Activity Report',
    subtitle: 'Last 200 tracked user activities',
    filename: 'audit-activity-report.pdf',
    columns: [
      { key: 'created_at', label: 'Timestamp' },
      { key: 'full_name', label: 'User' },
      { key: 'username', label: 'Username' },
      { key: 'action', label: 'Action' },
      { key: 'resource', label: 'Resource' },
      { key: 'resource_id', label: 'Resource ID' },
      { key: 'details', label: 'Details' }
    ],
    rows: window._allAuditLogs || []
  });
}

/* ── Admissions Page ── */
async function renderAdmissions() {
  try {
    const admissions = await API.get('/api/admissions');
    window._allAdmissions = admissions;
    let html = `<div class="section-header"><h3 class="section-title">Admissions</h3><div class="section-actions">
      ${reportBtn('downloadAdmissionsReport()', 'Report PDF')}
      ${ifCanWrite('admissions', `<button class="btn btn-primary" onclick="showAdmissionForm()">${Icon('plus',14)} New Admission</button>`)}</div></div>`;
    html += buildTable(
      [{key:'id',label:'ID'},{key:'patient_name',label:'Patient'},{key:'room_number',label:'Room'},{key:'doctor_name',label:'Doctor'},
       {key:'admit_date',label:'Admitted',render:v=>v?v.split('T')[0]:'-'},{key:'discharge_date',label:'Discharged',render:v=>v?v.split('T')[0]:'—'},
       {key:'diagnosis',label:'Diagnosis'},{key:'status',label:'Status',render:v=>statusBadge(v)}],
      admissions,
      moduleCanWrite('admissions') ? (row) => {
        let btns = '';
        if(row.status==='Admitted') btns += dischargeBtn(`dischargePatient(${row.id})`);
        btns += `${editBtn(`showAdmissionForm(${row.id})`)}${deleteBtn(`deleteAdmission(${row.id})`)}`;
        return btns;
      } : null
    );
    document.getElementById('pageContent').innerHTML = html;
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function showAdmissionForm(id) {
  let a={patient_id:'',room_id:'',doctor_id:'',admit_date:'',diagnosis:'',status:'Admitted'};
  if(id) try{a=await API.get(`/api/admissions/${id}`);}catch(e){}
  let patients=[],rooms=[],doctors=[];
  try{patients=await API.get('/api/patients');rooms=await API.get('/api/rooms');doctors=await API.get('/api/doctors');}catch(e){}
  openModal(id?'Edit Admission':'New Admission',`<form id="admForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Patient *</label><select name="patient_id" class="form-control">
      <option value="">Select</option>${patients.map(p=>`<option value="${p.id}" ${a.patient_id==p.id?'selected':''}>${p.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Doctor</label><select name="doctor_id" class="form-control">
      <option value="">Select</option>${doctors.map(d=>`<option value="${d.id}" ${a.doctor_id==d.id?'selected':''}>${d.name}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Room</label><select name="room_id" class="form-control">
      <option value="">Select</option>${rooms.map(r=>`<option value="${r.id}" ${a.room_id==r.id?'selected':''}>${r.room_number} (${r.type})</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Admit Date</label><input name="admit_date" type="date" class="form-control" value="${(a.admit_date||'').split('T')[0]}"></div></div>
    <div class="form-group"><label class="form-label">Diagnosis</label><textarea name="diagnosis" class="form-control">${a.diagnosis||''}</textarea></div>
  </form>`,async()=>{
    const d=getFormData('admForm');if(!d.patient_id){showToast('Patient required','error');return;}
    try{if(id)await API.put(`/api/admissions/${id}`,d);else await API.post('/api/admissions',d);
      closeModal();showToast(id?'Updated':'Patient admitted','success');renderAdmissions();}catch(e){showToast(e.message,'error');}
  });
}

async function dischargePatient(id) {
  openModal('Discharge Patient',`<form id="dischargeForm">
    <div class="form-group"><label class="form-label">Discharge Summary</label><textarea name="discharge_summary" class="form-control" placeholder="Enter discharge notes..."></textarea></div>
  </form>`,async()=>{
    const d=getFormData('dischargeForm');
    try{await API.put(`/api/admissions/${id}`,{status:'Discharged',discharge_date:new Date().toISOString().split('T')[0],discharge_summary:d.discharge_summary});
      closeModal();showToast('Patient discharged','success');renderAdmissions();}catch(e){showToast(e.message,'error');}
  });
}

async function deleteAdmission(id){
  if(await confirmAction('Delete this admission record?')){
    try{await API.del(`/api/admissions/${id}`);showToast('Deleted','success');renderAdmissions();}catch(e){showToast(e.message,'error');}
  }
}

/* ── Medical Records Page ── */
async function renderMedicalRecords() {
  try {
    const records = await API.get('/api/medical-records');
    let html = `<div class="section-header"><h3 class="section-title">Medical Records</h3><div class="section-actions">
      ${searchBoxHtml('recordSearch','Search by patient or diagnosis...','filterRecords()')}
      ${reportBtn('downloadMedicalRecordsReport()', 'Report PDF')}
      ${ifCanWrite('medical-records', `<button class="btn btn-primary" onclick="showRecordForm()">${Icon('plus',14)} Add Record</button>`)}</div></div>`;
    html += `<div id="recordsTable">${buildRecordsTable(records)}</div>`;
    document.getElementById('pageContent').innerHTML = html;
    window._allRecords = records;
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

function buildRecordsTable(records) {
  return buildTable(
    [{key:'id',label:'ID'},{key:'patient_name',label:'Patient'},{key:'doctor_name',label:'Doctor'},
     {key:'record_date',label:'Date',render:v=>v?v.split('T')[0]:'-'},{key:'diagnosis',label:'Diagnosis'},{key:'treatment',label:'Treatment'}],
    records,
    (row) => `${viewBtn(`viewRecord(${row.id})`)}${moduleCanWrite('medical-records') ? `${editBtn(`showRecordForm(${row.id})`)}${deleteBtn(`deleteRecord(${row.id})`)}` : ''}`
  );
}

function filterRecords(){
  const q=document.getElementById('recordSearch').value.toLowerCase();
  const f=(window._allRecords||[]).filter(r=>(r.patient_name||'').toLowerCase().includes(q)||(r.diagnosis||'').toLowerCase().includes(q));
  document.getElementById('recordsTable').innerHTML=buildRecordsTable(f);
}

async function viewRecord(id){
  try{
    const r=await API.get(`/api/medical-records/${id}`);
    openModal('Medical Record Details',`
      <div style="display:grid;gap:14px">
        <div><span class="form-label">Patient</span><p>${r.patient_name||'-'}</p></div>
        <div><span class="form-label">Doctor</span><p>${r.doctor_name||'-'}</p></div>
        <div><span class="form-label">Date</span><p>${(r.record_date||'').split('T')[0]}</p></div>
        <div><span class="form-label">Diagnosis</span><p>${r.diagnosis||'-'}</p></div>
        <div><span class="form-label">Treatment</span><p>${r.treatment||'-'}</p></div>
        <div><span class="form-label">Prescription</span><p>${r.prescription||'-'}</p></div>
        <div><span class="form-label">Notes</span><p>${r.notes||'-'}</p></div>
      </div>`,null);
  }catch(e){showToast(e.message,'error');}
}

async function showRecordForm(id){
  let r={patient_id:'',doctor_id:'',record_date:'',diagnosis:'',treatment:'',prescription:'',notes:''};
  if(id) try{r=await API.get(`/api/medical-records/${id}`);}catch(e){}
  let patients=[],doctors=[];
  try{patients=await API.get('/api/patients');doctors=await API.get('/api/doctors');}catch(e){}
  openModal(id?'Edit Record':'Add Record',`<form id="recForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Patient *</label><select name="patient_id" class="form-control">
      <option value="">Select</option>${patients.map(p=>`<option value="${p.id}" ${r.patient_id==p.id?'selected':''}>${p.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Doctor</label><select name="doctor_id" class="form-control">
      <option value="">Select</option>${doctors.map(d=>`<option value="${d.id}" ${r.doctor_id==d.id?'selected':''}>${d.name}</option>`).join('')}</select></div></div>
    <div class="form-group"><label class="form-label">Date</label><input name="record_date" type="date" class="form-control" value="${(r.record_date||'').split('T')[0]}"></div>
    <div class="form-group"><label class="form-label">Diagnosis *</label><textarea name="diagnosis" class="form-control">${r.diagnosis||''}</textarea></div>
    <div class="form-group"><label class="form-label">Treatment</label><textarea name="treatment" class="form-control">${r.treatment||''}</textarea></div>
    <div class="form-group"><label class="form-label">Prescription</label><textarea name="prescription" class="form-control">${r.prescription||''}</textarea></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-control">${r.notes||''}</textarea></div>
  </form>`,async()=>{
    const d=getFormData('recForm');if(!d.patient_id||!d.diagnosis){showToast('Patient & diagnosis required','error');return;}
    try{if(id)await API.put(`/api/medical-records/${id}`,d);else await API.post('/api/medical-records',d);
      closeModal();showToast(id?'Updated':'Added','success');renderMedicalRecords();}catch(e){showToast(e.message,'error');}
  });
}

async function deleteRecord(id){if(await confirmAction('Delete this record?')){try{await API.del(`/api/medical-records/${id}`);showToast('Deleted','success');renderMedicalRecords();}catch(e){showToast(e.message,'error');}}}

/* ── Appointments Page ── */
async function renderAppointments(){
  try{
    const appts = await API.get('/api/appointments');
    window._allAppointments = appts;
    let html = `<div class="section-header"><h3 class="section-title">Appointments</h3><div class="section-actions">
      ${reportBtn('downloadAppointmentsReport()', 'Report PDF')}
      ${ifCanWrite('appointments', `<button class="btn btn-primary" onclick="showAppointmentForm()">${Icon('plus',14)} Book Appointment</button>`)}</div></div>`;
    html += buildTable(
      [{key:'id',label:'ID'},{key:'patient_name',label:'Patient'},{key:'doctor_name',label:'Doctor'},
       {key:'appointment_date',label:'Date'},{key:'appointment_time',label:'Time'},{key:'reason',label:'Reason'},
       {key:'status',label:'Status',render:v=>statusBadge(v)}],
      appts,
      moduleCanWrite('appointments') ? (row)=>`${editBtn(`showAppointmentForm(${row.id})`)}${deleteBtn(`deleteAppointment(${row.id})`)}` : null
    );
    document.getElementById('pageContent').innerHTML=html;
  }catch(e){showToast('Error: '+e.message,'error');}
}

async function showAppointmentForm(id){
  let a={patient_id:'',doctor_id:'',appointment_date:'',appointment_time:'',reason:'',status:'Scheduled'};
  if(id) try{a=await API.get(`/api/appointments/${id}`);}catch(e){}
  let patients=[],doctors=[];
  try{patients=await API.get('/api/patients');doctors=await API.get('/api/doctors');}catch(e){}
  openModal(id?'Edit Appointment':'Book Appointment',`<form id="apptForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Patient *</label><select name="patient_id" class="form-control">
      <option value="">Select</option>${patients.map(p=>`<option value="${p.id}" ${a.patient_id==p.id?'selected':''}>${p.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Doctor *</label><select name="doctor_id" class="form-control">
      <option value="">Select</option>${doctors.map(d=>`<option value="${d.id}" ${a.doctor_id==d.id?'selected':''}>${d.name}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Date *</label><input name="appointment_date" type="date" class="form-control" value="${a.appointment_date||''}"></div>
    <div class="form-group"><label class="form-label">Time *</label><input name="appointment_time" type="time" class="form-control" value="${a.appointment_time||''}"></div></div>
    <div class="form-group"><label class="form-label">Reason</label><textarea name="reason" class="form-control">${a.reason||''}</textarea></div>
    ${id?`<div class="form-group"><label class="form-label">Status</label><select name="status" class="form-control">
      ${['Scheduled','Completed','Cancelled','No Show'].map(s=>`<option ${a.status===s?'selected':''}>${s}</option>`).join('')}</select></div>`:''}
  </form>`,async()=>{
    const d=getFormData('apptForm');if(!d.patient_id||!d.doctor_id||!d.appointment_date||!d.appointment_time){showToast('Fill all required fields','error');return;}
    try{if(id)await API.put(`/api/appointments/${id}`,d);else await API.post('/api/appointments',d);
      closeModal();showToast(id?'Updated':'Booked','success');renderAppointments();}catch(e){showToast(e.message,'error');}
  });
}

async function deleteAppointment(id){if(await confirmAction('Delete this appointment?')){try{await API.del(`/api/appointments/${id}`);showToast('Deleted','success');renderAppointments();}catch(e){showToast(e.message,'error');}}}

/* ── Billing Page ── */
async function renderBilling(){
  try{
    const bills=await API.get('/api/billing');
    window._allBills = bills;
    let html=`<div class="section-header"><h3 class="section-title">Billing</h3><div class="section-actions">
      ${reportBtn('downloadBillingReport()', 'Report PDF')}
      ${ifCanWrite('billing', `<button class="btn btn-primary" onclick="showBillForm()">${Icon('plus',14)} New Bill</button>`)}</div></div>`;
    html+=buildTable(
      [{key:'id',label:'ID'},{key:'patient_name',label:'Patient'},{key:'description',label:'Description'},
       {key:'total_amount',label:'Total (৳)',render:v=>`৳${Number(v||0).toLocaleString()}`},{key:'paid_amount',label:'Paid (৳)',render:v=>`৳${Number(v||0).toLocaleString()}`},
       {key:'payment_method',label:'Method'},{key:'billing_date',label:'Date',render:v=>v?v.split('T')[0]:'-'},
       {key:'status',label:'Status',render:v=>statusBadge(v)}],
      bills,
      (row)=>`${invoiceBtn(`downloadBillInvoice(${row.id})`)}${moduleCanWrite('billing') ? `${editBtn(`showBillForm(${row.id})`)}${deleteBtn(`deleteBill(${row.id})`)}` : ''}`
    );
    document.getElementById('pageContent').innerHTML=html;
  }catch(e){showToast('Error: '+e.message,'error');}
}

async function showBillForm(id){
  let b={patient_id:'',admission_id:'',total_amount:'',paid_amount:'',payment_method:'',status:'Pending',due_date:'',description:''};
  if(id) try{b=await API.get(`/api/billing/${id}`);}catch(e){}
  let patients=[],admissions=[];
  try{patients=await API.get('/api/patients');admissions=await API.get('/api/admissions');}catch(e){}
  openModal(id?'Edit Bill':'New Bill',`<form id="billForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Patient *</label><select name="patient_id" class="form-control">
      <option value="">Select</option>${patients.map(p=>`<option value="${p.id}" ${b.patient_id==p.id?'selected':''}>${p.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Admission</label><select name="admission_id" class="form-control">
      <option value="">None</option>${admissions.map(a=>`<option value="${a.id}" ${b.admission_id==a.id?'selected':''}>#${a.id} - ${a.patient_name||'Patient '+a.patient_id}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Total Amount *</label><input name="total_amount" type="number" class="form-control" value="${b.total_amount||''}"></div>
    <div class="form-group"><label class="form-label">Paid Amount</label><input name="paid_amount" type="number" class="form-control" value="${b.paid_amount||0}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Payment Method</label><select name="payment_method" class="form-control">
      <option value="">Select</option>${['Cash','Card','Bank Transfer','Insurance'].map(m=>`<option ${b.payment_method===m?'selected':''}>${m}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Status</label><select name="status" class="form-control">
      ${['Pending','Partial','Paid','Overdue'].map(s=>`<option ${b.status===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Due Date</label><input name="due_date" type="date" class="form-control" value="${b.due_date||''}"></div>
    <div class="form-group"><label class="form-label">Description</label><input name="description" class="form-control" value="${b.description||''}"></div></div>
  </form>`,async()=>{
    const d=getFormData('billForm');if(!d.patient_id||!d.total_amount){showToast('Patient & amount required','error');return;}
    try{if(id)await API.put(`/api/billing/${id}`,d);else await API.post('/api/billing',d);
      closeModal();showToast(id?'Updated':'Bill created','success');renderBilling();}catch(e){showToast(e.message,'error');}
  });
}

async function deleteBill(id){if(await confirmAction('Delete this bill?')){try{await API.del(`/api/billing/${id}`);showToast('Deleted','success');renderBilling();}catch(e){showToast(e.message,'error');}}}

/* ── Staff & Duties Page ── */
async function renderStaff(){
  try{
    const staff=await API.get('/api/staff');
    window._allStaff = staff;
    let html=`<div class="section-header"><h3 class="section-title">Staff</h3><div class="section-actions">
      ${reportBtn('downloadStaffReport()', 'Report PDF')}
      ${moduleCanRead('staff-duties') ? `<button class="btn btn-secondary" onclick="renderDuties()">${Icon('calendar',14)} View Duty Roster</button>` : ''}
      ${ifCanWrite('staff', `<button class="btn btn-primary" onclick="showStaffForm()">${Icon('plus',14)} Add Staff</button>`)}</div></div>`;
    html+=buildTable(
      [{key:'id',label:'ID'},{key:'name',label:'Name'},{key:'role',label:'Role'},{key:'department_name',label:'Department'},
       {key:'phone',label:'Phone'},{key:'hire_date',label:'Hired'},{key:'status',label:'Status',render:v=>statusBadge(v)}],
      staff,
      moduleCanWrite('staff') ? (row)=>`${editBtn(`showStaffForm(${row.id})`)}${deleteBtn(`deleteStaffMember(${row.id})`)}` : null
    );
    document.getElementById('pageContent').innerHTML=html;
  }catch(e){showToast('Error: '+e.message,'error');}
}

async function showStaffForm(id){
  let s={name:'',role:'',department_id:'',phone:'',email:'',hire_date:'',status:'Active'};
  if(id) try{s=await API.get(`/api/staff/${id}`);}catch(e){}
  let depts=[];try{depts=await API.get('/api/departments');}catch(e){}
  openModal(id?'Edit Staff':'Add Staff',`<form id="staffForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Name *</label><input name="name" class="form-control" value="${s.name||''}"></div>
    <div class="form-group"><label class="form-label">Role *</label><input name="role" class="form-control" value="${s.role||''}" placeholder="Nurse, Technician..."></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Department</label><select name="department_id" class="form-control">
      <option value="">Select</option>${depts.map(d=>`<option value="${d.id}" ${s.department_id==d.id?'selected':''}>${d.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Status</label><select name="status" class="form-control">
      ${['Active','On Leave','Inactive'].map(st=>`<option ${s.status===st?'selected':''}>${st}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Phone</label><input name="phone" class="form-control" value="${s.phone||''}"></div>
    <div class="form-group"><label class="form-label">Email</label><input name="email" type="email" class="form-control" value="${s.email||''}"></div></div>
    <div class="form-group"><label class="form-label">Hire Date</label><input name="hire_date" type="date" class="form-control" value="${s.hire_date||''}"></div>
  </form>`,async()=>{
    const d=getFormData('staffForm');if(!d.name||!d.role){showToast('Name & role required','error');return;}
    try{if(id)await API.put(`/api/staff/${id}`,d);else await API.post('/api/staff',d);
      closeModal();showToast(id?'Updated':'Added','success');renderStaff();}catch(e){showToast(e.message,'error');}
  });
}

async function deleteStaffMember(id){if(await confirmAction('Delete this staff member?')){try{await API.del(`/api/staff/${id}`);showToast('Deleted','success');renderStaff();}catch(e){showToast(e.message,'error');}}}

async function renderDuties(){
  try{
    const duties=await API.get('/api/staff-duties');
    window._allDuties = duties;
    let html=`<div class="section-header"><h3 class="section-title">Duty Roster</h3><div class="section-actions">
      <button class="btn btn-secondary" onclick="renderStaff()">← Back to Staff</button>
      ${reportBtn('downloadDutiesReport()', 'Report PDF')}
      ${ifCanWrite('staff-duties', `<button class="btn btn-primary" onclick="showDutyForm()">${Icon('plus',14)} Assign Duty</button>`)}</div></div>`;
    html+=buildTable(
      [{key:'staff_name',label:'Staff'},{key:'shift',label:'Shift',render:v=>badgeHtml(v,v==='Morning'?'warning':v==='Afternoon'?'info':'default')},
       {key:'day_of_week',label:'Day'},{key:'assigned_area',label:'Area'}],
      duties,
      moduleCanWrite('staff-duties') ? (row)=>deleteBtn(`deleteDuty(${row.id})`) : null
    );
    document.getElementById('pageContent').innerHTML=html;
  }catch(e){showToast('Error: '+e.message,'error');}
}

async function showDutyForm(){
  let staff=[];try{staff=await API.get('/api/staff');}catch(e){}
  openModal('Assign Duty',`<form id="dutyForm">
    <div class="form-group"><label class="form-label">Staff *</label><select name="staff_id" class="form-control">
      <option value="">Select</option>${staff.map(s=>`<option value="${s.id}">${s.name} (${s.role})</option>`).join('')}</select></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Shift</label><select name="shift" class="form-control">
      ${['Morning','Afternoon','Night'].map(s=>`<option>${s}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Day</label><select name="day_of_week" class="form-control">
      ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=>`<option>${d}</option>`).join('')}</select></div></div>
    <div class="form-group"><label class="form-label">Assigned Area</label><input name="assigned_area" class="form-control" placeholder="e.g. Emergency Ward"></div>
  </form>`,async()=>{
    const d=getFormData('dutyForm');if(!d.staff_id){showToast('Select staff','error');return;}
    try{await API.post('/api/staff-duties',d);closeModal();showToast('Duty assigned','success');renderDuties();}catch(e){showToast(e.message,'error');}
  });
}

async function deleteDuty(id){if(await confirmAction('Remove this duty?')){try{await API.del(`/api/staff-duties/${id}`);showToast('Removed','success');renderDuties();}catch(e){showToast(e.message,'error');}}}

/* ── Blood Bank Page ── */
async function renderBloodBank(){
  try{
    const donations=await API.get('/api/blood-donations');
    const summary=await API.get('/api/blood-donations/summary');
    let html=`<div class="section-header"><h3 class="section-title">Blood Bank</h3><div class="section-actions">
      ${searchBoxHtml('bloodSearch','Search by blood group...','filterBlood()')}
      ${reportBtn('downloadBloodBankReport()', 'Report PDF')}
      ${ifCanWrite('blood-donations', `<button class="btn btn-primary" onclick="showDonationForm()">${Icon('plus',14)} Add Donation</button>`)}</div></div>`;
    html+=`<div class="blood-grid">`;
    ['A+','A-','B+','B-','AB+','AB-','O+','O-'].forEach(g=>{const f=summary.find(s=>s.blood_group===g);
      html+=`<div class="blood-card"><div class="blood-card-group">${g}</div><div class="blood-card-units">${f?f.total_units:0} units</div><div class="blood-card-label">available</div></div>`;
    });
    html+=`</div><div id="bloodTable">${buildBloodTable(donations)}</div>`;
    document.getElementById('pageContent').innerHTML=html;
    window._allDonations=donations;
  }catch(e){showToast('Error: '+e.message,'error');}
}

function buildBloodTable(donations){
  return buildTable(
    [{key:'id',label:'ID'},{key:'donor_name',label:'Donor'},{key:'blood_group',label:'Group',render:v=>badgeHtml(v,'danger')},
     {key:'units',label:'Units'},{key:'donation_date',label:'Date'},{key:'expiry_date',label:'Expiry'},
     {key:'status',label:'Status',render:v=>statusBadge(v)}],
    donations,
    moduleCanWrite('blood-donations') ? (row)=>`${editBtn(`showDonationForm(${row.id})`)}${deleteBtn(`deleteDonation(${row.id})`)}` : null
  );
}

function filterBlood(){
  const q=document.getElementById('bloodSearch').value.toLowerCase();
  const f=(window._allDonations||[]).filter(d=>(d.blood_group||'').toLowerCase().includes(q)||(d.donor_name||'').toLowerCase().includes(q));
  document.getElementById('bloodTable').innerHTML=buildBloodTable(f);
}

async function showDonationForm(id){
  let d={donor_name:'',patient_id:'',blood_group:'',units:1,donation_date:'',expiry_date:'',status:'Available'};
  if(id) try{d=await API.get(`/api/blood-donations/${id}`);}catch(e){}
  let patients=[];try{patients=await API.get('/api/patients');}catch(e){}
  openModal(id?'Edit Donation':'Add Donation',`<form id="donForm">
    <div class="form-row"><div class="form-group"><label class="form-label">Donor Name *</label><input name="donor_name" class="form-control" value="${d.donor_name||''}"></div>
    <div class="form-group"><label class="form-label">Linked Patient</label><select name="patient_id" class="form-control">
      <option value="">None (External)</option>${patients.map(p=>`<option value="${p.id}" ${d.patient_id==p.id?'selected':''}>${p.name}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Blood Group *</label><select name="blood_group" class="form-control">
      <option value="">Select</option>${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b=>`<option ${d.blood_group===b?'selected':''}>${b}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Units</label><input name="units" type="number" step="0.5" class="form-control" value="${d.units||1}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Donation Date</label><input name="donation_date" type="date" class="form-control" value="${d.donation_date||''}"></div>
    <div class="form-group"><label class="form-label">Expiry Date</label><input name="expiry_date" type="date" class="form-control" value="${d.expiry_date||''}"></div></div>
    <div class="form-group"><label class="form-label">Status</label><select name="status" class="form-control">
      ${['Available','Used','Expired','Discarded'].map(s=>`<option ${d.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
  </form>`,async()=>{
    const data=getFormData('donForm');if(!data.donor_name||!data.blood_group){showToast('Donor name & blood group required','error');return;}
    try{if(id)await API.put(`/api/blood-donations/${id}`,data);else await API.post('/api/blood-donations',data);
      closeModal();showToast(id?'Updated':'Donation recorded','success');renderBloodBank();}catch(e){showToast(e.message,'error');}
  });
}

async function deleteDonation(id){if(await confirmAction('Delete this donation record?')){try{await API.del(`/api/blood-donations/${id}`);showToast('Deleted','success');renderBloodBank();}catch(e){showToast(e.message,'error');}}}

/* ═══ USER MANAGEMENT (Admin Only) ═══ */
async function renderUsers() {
  if (!Auth.isAdmin()) { document.getElementById('pageContent').innerHTML = `<div class="access-denied"><div class="access-denied-icon">${Icon('shield',56)}</div><h3 class="access-denied-title">Admin Only</h3></div>`; return; }
  try {
    const users = await API.get('/api/users');
    window._allUsers = users;
    let html = `<div class="section-header"><h3 class="section-title">User Accounts</h3><div class="section-actions">
      ${reportBtn('downloadUsersReport()', 'Report PDF')}
      <button class="btn btn-primary" onclick="showUserForm()">${Icon('plus',14)} Create User</button></div></div>`;
    html += buildTable(
      [{key:'id',label:'ID'},{key:'username',label:'Username'},{key:'full_name',label:'Full Name'},
       {key:'role',label:'Role',render:v=>roleBadge(v)},{key:'email',label:'Email'},
       {key:'status',label:'Status',render:v=>statusBadge(v)},
       {key:'last_login',label:'Last Login',render:v=>v?v.replace('T',' ').substring(0,16):'Never'}],
      users,
      (row) => `${passwordBtn(`showAdminChangePasswordModal(${row.id})`)}${editBtn(`showUserForm(${row.id})`)}${deleteBtn(`deleteUser(${row.id})`)}`
    );
    document.getElementById('pageContent').innerHTML = html;
  } catch(e) { showToast('Error: '+e.message, 'error'); }
}

function autoFillUserForm(selectElement) {
  if (!selectElement.value) return;
  const opt = selectElement.options[selectElement.selectedIndex];
  if (!opt.dataset.info) return;
  const info = JSON.parse(opt.dataset.info);
  
  const form = document.getElementById('userForm');
  let prefix = info.type === 'doctor' ? 'dr.' : (info.role === 'Nurse' ? 'nurse.' : 'staff.');
  let words = info.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w && w !== 'dr' && w !== 'mr' && w !== 'mrs' && w !== 'md');
  let firstName = words.length > 0 ? words[0] : 'user';
  let username = prefix + firstName;
  
  if (form.username) form.username.value = username;
  if (form.full_name) form.full_name.value = info.name;
  if (form.email) form.email.value = info.email || '';
  if (form.password) form.password.value = '123456';
  if (form.role) form.role.value = info.role;
}

async function showUserForm(id) {
  let u = { username:'', full_name:'', email:'', role:'Staff', status:'Active' };
  let linkOptions = '';
  if (id) {
    try { u = await API.get(`/api/users/${id}`); } catch(e) {}
  } else {
    try {
      const [doctors, staff] = await Promise.all([API.get('/api/doctors'), API.get('/api/staff')]);
      const opts = [];
      doctors.forEach(d => opts.push({ type: 'doctor', role: 'Junior Doctor', name: d.name, email: d.email || '' }));
      staff.forEach(s => opts.push({ type: 'staff', role: s.role === 'Nurse' ? 'Nurse' : 'Staff', name: s.name, email: s.email || '' }));
      
      linkOptions = `<div class="form-group" style="margin-bottom:16px; padding:12px; background:var(--accent-light); border-radius:var(--radius-md);">
        <label class="form-label" style="color:var(--accent); font-weight:600;">Link existing Doctor or Staff (Optional)</label>
        <select class="form-control" onchange="autoFillUserForm(this)">
          <option value="">-- Select a Profile to auto-fill --</option>
          ${opts.map((o, idx) => `<option value="${idx}" data-info='${JSON.stringify(o).replace(/'/g, "&#39;")}'>${o.name} (${o.role})</option>`).join('')}
        </select>
      </div>`;
    } catch(e) {}
  }
  
  openModal(id ? 'Edit User' : 'Create User', `<form id="userForm">
    ${linkOptions}
    ${id ? `<div class="form-group" style="text-align:center;margin-bottom:16px;">
      <div class="upload-zone" onclick="document.getElementById('avatarInput').click()" id="avatarZone">
        ${u.avatar_url ? `<img src="${u.avatar_url}" class="upload-preview" id="avatarPreview">` : `<div class="upload-zone-icon">${Icon('camera',32)}</div>`}
        <div class="upload-zone-text">Click to upload avatar</div>
        <div class="upload-zone-hint">JPG, PNG up to 2MB</div>
      </div>
      <input type="file" id="avatarInput" accept="image/*" style="display:none" onchange="uploadAvatar(${id}, this)">
    </div>` : ''}
    <div class="form-row"><div class="form-group"><label class="form-label">Username *</label><input name="username" class="form-control" value="${u.username||''}" ${id?'readonly':''}></div>
    <div class="form-group"><label class="form-label">Full Name *</label><input name="full_name" class="form-control" value="${u.full_name||''}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">${id?'New Password (leave blank to keep)':'Password *'}</label><input name="password" type="password" class="form-control" placeholder="Min 6 characters"></div>
    <div class="form-group"><label class="form-label">Email</label><input name="email" type="email" class="form-control" value="${u.email||''}"></div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Role *</label><select name="role" class="form-control">
      ${['Admin','Senior Doctor','Junior Doctor','Nurse','Staff'].map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Status</label><select name="status" class="form-control">
      ${['Active','Inactive'].map(s=>`<option ${u.status===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
  </form>`, async() => {
    const d = getFormData('userForm');
    if (!d.full_name) { showToast('Full name required','error'); return; }
    if (!id && (!d.username || !d.password)) { showToast('Username and password required','error'); return; }
    if (d.password && d.password.length < 6) { showToast('Password must be at least 6 characters','error'); return; }
    try {
      if (id) await API.put(`/api/users/${id}`, d);
      else await API.post('/api/users', d);
      closeModal(); showToast(id?'User updated':'User created', 'success'); renderUsers();
    } catch(e) { showToast(e.message, 'error'); }
  });
}

async function uploadAvatar(userId, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('File too large (max 2MB)','error'); return; }
  const formData = new FormData();
  formData.append('avatar', file);
  try {
    const res = await fetch(`/api/users/${userId}/avatar`, {
      method:'POST',
      headers: { 'Authorization': 'Bearer ' + Auth.getToken() },
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    showToast('Avatar uploaded','success');
    const preview = document.getElementById('avatarPreview');
    const zone = document.getElementById('avatarZone');
    if (preview) { preview.src = data.avatar_url + '?t=' + Date.now(); }
    else { zone.innerHTML = `<img src="${data.avatar_url}?t=${Date.now()}" class="upload-preview" id="avatarPreview"><div class="upload-zone-text">Click to change</div>`; }
  } catch(e) { showToast(e.message,'error'); }
}

async function deleteUser(id) {
  const currentUser = Auth.getUser();
  if (currentUser && currentUser.id === id) { showToast("Cannot delete your own account", 'error'); return; }
  if (await confirmAction('Delete this user account? This cannot be undone.')) {
    try { await API.del(`/api/users/${id}`); showToast('User deleted','success'); renderUsers(); }
    catch(e) { showToast(e.message, 'error'); }
  }
}

/* ═══ AUDIT LOG (Admin Only) ═══ */
async function renderAuditLog() {
  if (!Auth.isAdmin()) { document.getElementById('pageContent').innerHTML = `<div class="access-denied"><div class="access-denied-icon">${Icon('shield',56)}</div><h3 class="access-denied-title">Admin Only</h3></div>`; return; }
  try {
    const logs = await API.get('/api/audit-log');
    window._allAuditLogs = logs;
    let html = `<div class="section-header"><h3 class="section-title">${Icon('scroll',18)} Activity Log</h3><div class="section-actions">
      ${reportBtn('downloadAuditLogReport()', 'Report PDF')}
      <p style="color:var(--text-muted);font-size:12px">Last 200 actions tracked</p></div></div>`;
    html += buildTable(
      [{key:'created_at',label:'Timestamp',render:v=>v?v.replace('T',' ').substring(0,19):''},
       {key:'full_name',label:'User'},{key:'username',label:'Username'},
       {key:'action',label:'Action',render:v=>{
         const colors = {CREATE:'success',UPDATE:'info',DELETE:'danger',LOGIN:'warning',LOGOUT:'default',PASSWORD_CHANGE:'warning'};
         return badgeHtml(v, colors[v]||'default');
       }},
       {key:'resource',label:'Resource'},{key:'resource_id',label:'ID'},
       {key:'details',label:'Details',render:v=>{
         if(!v) return '—';
         const s = v.length > 50 ? v.substring(0,50)+'...' : v;
         return `<span title="${v.replace(/"/g,'&quot;')}" style="font-size:11px;color:var(--text-muted)">${s}</span>`;
       }}],
      logs, null
    );
    document.getElementById('pageContent').innerHTML = html;
  } catch(e) { showToast('Error: '+e.message, 'error'); }
}

async function showAdminChangePasswordModal(userId) {
  openModal('Change User Password', `
    <form id="adminPasswordForm" autocomplete="off">
      <div class="form-group">
        <label class="form-label">New Password *</label>
        <div class="password-field-wrap">
          <input id="admin_new_password" name="password" type="password" class="form-control" placeholder="Minimum 6 characters" autocomplete="new-password">
          <button type="button" class="password-toggle-btn" onclick="toggleModalPassword('admin_new_password', this)" aria-label="Show password">${Icon('eye', 16)}</button>
        </div>
      </div>
    </form>`, async () => {
    const data = getFormData('adminPasswordForm');
    if (!data.password || data.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    try {
      await API.put('/api/users/' + userId, { password: data.password });
      closeModal();
      showToast('User password updated successfully', 'success');
      renderUsers();
    } catch(e) {
      showToast(e.message, 'error');
    }
  });
}
