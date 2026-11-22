/* ==========================================================================
   MedDrop – data layer
   Five tables, as in the database design (report §19):
   Users, Medicines, DisposalGuidance, CollectionFacilities, ReturnRequests.
   In this front-end prototype the tables live in the browser (localStorage);
   the production build replaces this file with calls to the Java/MySQL back end.
   ========================================================================== */

var STORAGE_KEY = "meddrop.data.v1";
var DEMO_PASSWORD = "Demo@123";

function daysFromNow(n, hour) {
  var d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour || 10, 15, 0, 0);
  return d.toISOString();
}
function dateOnly(iso) { return iso.slice(0, 10); }

var GUIDANCE_SEED = [
  { guidanceId: 1, medicineCategory: "tablets", specialHandling: false, instructions: [
    "Keep tablets and capsules in their original blister pack or bottle so staff can identify them.",
    "Cover or black out your name and personal details on any pharmacy label.",
    "Don't flush them or put them in household rubbish.",
    "Take them to a collection point that accepts tablets and capsules."] },
  { guidanceId: 2, medicineCategory: "liquids", specialHandling: false, instructions: [
    "Keep the liquid in its original bottle with the cap screwed on tightly.",
    "Put the bottle in a sealed plastic bag in case it leaks on the way.",
    "Never pour medicines down the sink or toilet.",
    "Return it to a collection point that accepts liquid medicines."] },
  { guidanceId: 3, medicineCategory: "topical", specialHandling: false, instructions: [
    "Close tubes, pots and dropper bottles tightly and keep them in their box if you still have it.",
    "Don't squeeze or rinse leftover cream into the sink.",
    "Return them to a collection point that accepts creams, ointments and drops."] },
  { guidanceId: 4, medicineCategory: "inhalers", specialHandling: false, instructions: [
    "Never puncture, crush or burn inhalers or spray cans – they are pressurised and can burst.",
    "Even an inhaler that feels empty usually still holds propellant and medicine, so return it rather than binning it.",
    "Put the cap back on and return it to a collection point that accepts inhalers."] },
  { guidanceId: 5, medicineCategory: "antibiotics", specialHandling: false, instructions: [
    "Return leftover antibiotics instead of keeping them for later or giving them to someone else.",
    "Don't flush them – antibiotics that reach water add to antibiotic resistance.",
    "Keep them in the original pack and return them to a collection point that accepts antibiotics."] },
  { guidanceId: 6, medicineCategory: "supplements", specialHandling: false, instructions: [
    "Keep vitamins and supplements in their original container.",
    "Return expired or unwanted ones to a collection point rather than throwing them away."] },
  { guidanceId: 7, medicineCategory: "injectables", specialHandling: true, instructions: [
    "Put used needles, lancets and pen needles straight into a puncture-resistant sharps container.",
    "Don't recap, bend or break needles, and never put loose needles in rubbish or recycling.",
    "Keep unused pens, vials and syringes in their original box.",
    "Close the sharps container securely before you carry it."],
    warningMessage: "Needles and other sharps can cause injuries and infections. Return them only in a closed sharps container, and only to a collection point that accepts sharps. Follow any instructions the staff give you." },
  { guidanceId: 8, medicineCategory: "controlled", specialHandling: true, instructions: [
    "Keep these medicines locked away until you return them.",
    "Hand them directly to the pharmacist or collection staff – don't leave them in a drop box.",
    "Never share them or give them to anyone else to return for you."],
    warningMessage: "Controlled medicines can be misused or cause serious harm to someone they weren't prescribed for. Return them in person to a collection point that accepts controlled medicines; staff may need to record the handover." },
  { guidanceId: 9, medicineCategory: "hazardous", specialHandling: true, instructions: [
    "Wear disposable gloves when you handle these medicines, and wash your hands afterwards.",
    "Keep them in their original sealed packaging inside a closed plastic bag.",
    "Keep them away from children, pets and anyone who is pregnant.",
    "Return them only to a collection point that accepts hazardous medicines – usually a hospital."],
    warningMessage: "Chemotherapy and other hazardous medicines can be harmful to touch. Don't open, crush or split them, and follow the collection point's handling instructions." }
  /* No guidance is stored for "other" – the page tells the user to ask a pharmacist (UC-02, E1). */
];

var ALL = ["tablets", "liquids", "topical", "inhalers", "antibiotics", "supplements", "injectables", "controlled", "hazardous"];
var GENERAL = ["tablets", "liquids", "topical", "inhalers", "antibiotics", "supplements"];

var FACILITY_SEED = [
  { facilityId: 1, facilityName: "Central Collection Point", address: "Hamdan Bin Mohammed Street, Building 14", area: "Al Markaziyah", city: "Abu Dhabi",
    contactNumber: "+971 2 600 1100", openDays: [0, 1, 2, 3, 4, 5, 6], opens: "08:00", closes: "22:00", acceptedCategories: ALL, lat: 24.4939, lng: 54.3700 },
  { facilityId: 2, facilityName: "Khalifa City Community Pharmacy", address: "Street 12, near Khalifa City Park", area: "Khalifa City", city: "Abu Dhabi",
    contactNumber: "+971 2 600 2200", openDays: [0, 1, 2, 3, 4, 6], opens: "09:00", closes: "21:00", acceptedCategories: GENERAL, lat: 24.4180, lng: 54.5780 },
  { facilityId: 3, facilityName: "Al Barsha Medicine Return Desk", address: "Al Barsha 1, opposite the community mall", area: "Al Barsha", city: "Dubai",
    contactNumber: "+971 4 600 3300", openDays: [0, 1, 2, 3, 4, 5, 6], opens: "08:00", closes: "23:00", acceptedCategories: GENERAL.concat(["injectables", "controlled"]), lat: 25.1130, lng: 55.2000 },
  { facilityId: 4, facilityName: "Deira Health Centre Drop-off", address: "Al Rigga Road, ground floor", area: "Deira", city: "Dubai",
    contactNumber: "+971 4 600 4400", openDays: [1, 2, 3, 4, 5, 6], opens: "07:30", closes: "15:30", acceptedCategories: ALL, lat: 25.2710, lng: 55.3080 },
  { facilityId: 5, facilityName: "Al Majaz Pharmacy Collection Box", address: "Corniche Street, Al Majaz 2", area: "Al Majaz", city: "Sharjah",
    contactNumber: "+971 6 600 5500", openDays: [0, 1, 2, 3, 4, 5, 6], opens: "10:00", closes: "22:00", acceptedCategories: GENERAL, lat: 25.3250, lng: 55.3830 },
  { facilityId: 6, facilityName: "Al Jimi Collection Point", address: "Al Jimi District, Hospital Road", area: "Al Jimi", city: "Al Ain",
    contactNumber: "+971 3 600 6600", openDays: [0, 1, 2, 3, 4], opens: "08:00", closes: "20:00", acceptedCategories: ALL, lat: 24.2420, lng: 55.7300 },
  { facilityId: 7, facilityName: "Mussafah Clinic Drop-off", address: "Mussafah M-10, Clinic Building", area: "Mussafah", city: "Abu Dhabi",
    contactNumber: "+971 2 600 7700", openDays: [0, 1, 2, 3, 4], opens: "08:00", closes: "16:00", acceptedCategories: GENERAL, lat: 24.3500, lng: 54.5000, status: "Inactive" }
];

function seedUsers() {
  var p = hashPassword(DEMO_PASSWORD);
  return [
    { userId: 1, fullName: "Sara Al Mansoori", email: "sara@example.com", passwordHash: p, role: "Household", phoneNumber: "+971 50 111 2233", createdAt: daysFromNow(-60) },
    { userId: 2, fullName: "Omar Haddad", email: "omar@example.com", passwordHash: p, role: "Household", createdAt: daysFromNow(-41) },
    { userId: 3, fullName: "Khalid Rahman", email: "khalid@meddrop.ae", passwordHash: p, role: "Staff", facilityId: 1, employeeCode: "CCP-014", createdAt: daysFromNow(-90) },
    { userId: 4, fullName: "Mariam Yousef", email: "mariam@meddrop.ae", passwordHash: p, role: "Staff", facilityId: 3, employeeCode: "ABR-007", createdAt: daysFromNow(-88) },
    { userId: 5, fullName: "Layla Nasser", email: "admin@meddrop.ae", passwordHash: p, role: "Admin", adminLevel: "Full", createdAt: daysFromNow(-120) },
    { userId: 6, fullName: "Hassan Ali", email: "hassan@example.com", passwordHash: p, role: "Household", accountStatus: "Suspended", createdAt: daysFromNow(-30) }
  ];
}

function seedMedicines() {
  return [
    { medicineId: 1, userId: 1, medicineName: "Paracetamol", dosage: "500 mg", dosageForm: "Tablet", medicineCategory: "tablets", quantity: 2, expiryDate: dateOnly(daysFromNow(-20)), registrationMethod: "Manual", registeredAt: daysFromNow(-12) },
    { medicineId: 2, userId: 1, medicineName: "Amoxicillin", dosage: "250 mg/5 ml", dosageForm: "Suspension", medicineCategory: "antibiotics", quantity: 1, expiryDate: dateOnly(daysFromNow(-45)), registrationMethod: "AI", registeredAt: daysFromNow(-25) },
    { medicineId: 3, userId: 1, medicineName: "Insulin glargine pen", dosage: "100 units/ml", dosageForm: "Pre-filled pen", medicineCategory: "injectables", quantity: 3, expiryDate: dateOnly(daysFromNow(40)), registrationMethod: "Manual", registeredAt: daysFromNow(-5) },
    { medicineId: 4, userId: 1, medicineName: "Salbutamol inhaler", dosage: "100 mcg/dose", dosageForm: "Inhaler", medicineCategory: "inhalers", quantity: 1, expiryDate: dateOnly(daysFromNow(150)), registrationMethod: "AI", registeredAt: daysFromNow(-2) },
    { medicineId: 5, userId: 2, medicineName: "Ibuprofen", dosage: "400 mg", dosageForm: "Tablet", medicineCategory: "tablets", quantity: 1, expiryDate: dateOnly(daysFromNow(-3)), registrationMethod: "Manual", registeredAt: daysFromNow(-6) },
    { medicineId: 6, userId: 2, medicineName: "Vitamin C", dosage: "1000 mg", dosageForm: "Tablet", medicineCategory: "supplements", quantity: 1, expiryDate: dateOnly(daysFromNow(-60)), registrationMethod: "Manual", registeredAt: daysFromNow(-9) }
  ];
}

function seedRequests() {
  return [
    { requestId: 1, medicineId: 1, facilityId: 1, requestStatus: "Pending", requestedAt: daysFromNow(-1, 9) },
    { requestId: 2, medicineId: 2, facilityId: 1, requestStatus: "Completed", requestedAt: daysFromNow(-20, 11), reviewedBy: 3, reviewedAt: daysFromNow(-19, 14), receivedAt: daysFromNow(-17, 17) },
    { requestId: 3, medicineId: 5, facilityId: 1, requestStatus: "Pending", requestedAt: daysFromNow(-2, 16) },
    { requestId: 4, medicineId: 6, facilityId: 1, requestStatus: "Accepted", requestedAt: daysFromNow(-4, 12), reviewedBy: 3, reviewedAt: daysFromNow(-3, 10) }
  ];
}

/* ------------------------------------------------------------ the store */
var Store = {
  tables: null,
  persistent: true,

  makeUser: function (r) {
    switch (r.role) {
      case "Household": return new HouseholdUser(r);
      case "Staff": return new FacilityStaff(r);
      case "Admin": return new Administrator(r);
      default: return new User(r);
    }
  },

  build: function (raw) {
    var self = this;
    this.tables = {
      users: raw.users.map(function (u) { return self.makeUser(u); }),
      medicines: raw.medicines.map(function (m) { return new Medicine(m); }),
      guidance: raw.guidance.map(function (g) { return new DisposalGuidance(g); }),
      facilities: raw.facilities.map(function (f) { return new CollectionFacility(f); }),
      requests: raw.requests.map(function (q) { return new ReturnRequest(q); })
    };
    for (var i = 0; i < this.tables.medicines.length; i++) {
      var m = this.tables.medicines[i];
      if (!m.guidanceId) m.guidanceId = this.guidanceIdFor(m.medicineCategory);
    }
  },

  reset: function () {
    this.build({ users: seedUsers(), medicines: seedMedicines(), guidance: GUIDANCE_SEED, facilities: FACILITY_SEED, requests: seedRequests() });
    this.save();
  },

  

  save: function () {
    if (!this.persistent) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tables)); }
    catch (e) { this.persistent = false; }
  },

  nextId: function (table) {
    var key = { users: "userId", medicines: "medicineId", facilities: "facilityId", requests: "requestId" }[table];
    var max = 0, rows = this.tables[table];
    for (var i = 0; i < rows.length; i++) if (rows[i][key] > max) max = rows[i][key];
    return max + 1;
  },

findBy: function (table, key, value) {
    var rows = this.tables[table];
    for (var i = 0; i < rows.length; i++) if (rows[i][key] === Number(value)) return rows[i];
    return null;
  },  
  findUser: function (id) { return this.findBy("users", "userId", id); },
  findMedicine: function (id) { return this.findBy("medicines", "medicineId", id); },
  findFacility: function (id) { return this.findBy("facilities", "facilityId", id); },
  findRequest: function (id) { return this.findBy("requests", "requestId", id); },
  findUserByEmail: function (email) {
    var e = String(email).trim().toLowerCase();
    for (var i = 0; i < this.tables.users.length; i++) if (this.tables.users[i].email.toLowerCase() === e) return this.tables.users[i];
    return null;
  },
  replaceUser: function (u) {
    for (var i = 0; i < this.tables.users.length; i++) if (this.tables.users[i].userId === u.userId) this.tables.users[i] = u;
  },

  activeFacilities: function () { return this.tables.facilities.filter(function (f) { return f.status === "Active"; }); },
  guidanceIdFor: function (cat) {
    for (var i = 0; i < this.tables.guidance.length; i++) if (this.tables.guidance[i].medicineCategory === cat) return this.tables.guidance[i].guidanceId;
    return null;
  },
  guidanceFor: function (med) { return med.guidanceId ? this.findBy("guidance", "guidanceId", med.guidanceId) : null; },
  medicinesForUser: function (uid) { return this.tables.medicines.filter(function (m) { return m.userId === uid; }); },
  openRequestFor: function (medId) {
    var rows = this.tables.requests;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].medicineId === medId && (rows[i].requestStatus === "Pending" || rows[i].requestStatus === "Accepted")) return rows[i];
    }
    return null;
  },
  latestRequestFor: function (medId) {
    var found = null;
    this.tables.requests.forEach(function (r) { if (r.medicineId === medId && (!found || r.requestId > found.requestId)) found = r; });
    return found;
  },
  /* FR-16: records are retrieved according to the viewer's role */
  requestsFor: function (user) {
    var self = this;
    var rows = this.tables.requests.filter(function (r) {
      switch (user.role) {
        case "Household": var m = self.findMedicine(r.medicineId); return m && m.userId === user.userId;
        case "Staff": return r.facilityId === user.facilityId;
        case "Admin": return true;
        default: return false;
      }
    });
    return rows.sort(function (a, b) { return b.requestId - a.requestId; });
  }
};
