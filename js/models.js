/* ==========================================================================
   MedDrop – domain classes
   Mirrors the UML Class Diagram (report §16) AND the messages of the three
   Sequence Diagrams (report §17). Every SD message is a method on the class
   whose lifeline receives it:

   SD UC-01 Register Medicine
     Household User → householdUser1 : registerMedicine(), enterMedicineDetails(details),
                                       identifyMedicine(photo), confirmDetails(details), correctDetails(details)
     householdUser1 → AI Recognition API : recognizeMedicine(photo) → identifiedDetails
     householdUser1 → medicine1     : verifyDetails(details) → verificationResult
                                       saveMedicine(details) → registrationConfirmed
     householdUser1 → Household User : showRegistrationOptions(), showEnteredDetails(details),
                                       showIdentifiedDetails(details), showConfirmation(), showValidationError()

   SD UC-02 View Disposal Guidance
     Household User → householdUser1 : viewDisposalGuidance(), selectMedicine(medicineID)
     householdUser1 → medicine1      : getRegisteredMedicines() → medicinelist, getMedicine(medicineID) → MedicineDetails
     householdUser1 → guidance1      : getDisposalGuidance(medicine details) → guidanceDetails,
                                       checkSpecialHandling(MedicineDetails) → Warning Status
     householdUser1 → Household User : showNoMedicineMessage, showMedicineList(), showUnavailableMessage(),
                                       showDisposalInstructionsAndWarning, showDisposalInstructions()

   SD UC-03 Submit Return Request
     Household User → householdUser1 : submitReturnRequest(), selectMedicine(medicineID), enterLocation(location),
                                       selectFacility(facilityID), confirmReturnRequest()
     householdUser1 → medicine1      : getRegisteredMedicines() → medicinelist
     householdUser1 → facility1      : searchFacilities(location) → matchingFacilities
     householdUser1 → returnRequest1 : validateRequest(medicineID, facilityID) → validationResult,
                                       saveRequest() → requestID, Pending
     householdUser1 → Household User : showMedicineList(), requestLocation(), showMatchingFacilities(),
                                       showRequestDetails(), showRequestConfirmation(), showValidationError()

   The "show…" return messages go to the actor, so they are implemented by the
   screens object in app.js (HouseholdScreens) that each HouseholdUser holds in `ui`.

   Class-diagram multiplicities kept:
     HouseholdUser 1 ── 0..* Medicine        Medicine 1 ── 0..* ReturnRequest
     CollectionFacility 1 ── 0..* ReturnRequest   FacilityStaff 0..1 ── 0..* ReturnRequest (reviewedBy)
     FacilityStaff 0..* ── 1 CollectionFacility   DisposalGuidance 0..1 ── 0..* Medicine
   The data layer (Store, in data.js) plays the part of the MySQL database.
   ========================================================================== */

/* Medicine categories used for guidance and facility acceptance */
var CATEGORIES = [
  { key: "tablets",     label: "Tablets & capsules" },
  { key: "liquids",     label: "Syrups & liquid medicines" },
  { key: "topical",     label: "Creams, ointments & drops" },
  { key: "inhalers",    label: "Inhalers & sprays" },
  { key: "antibiotics", label: "Antibiotics" },
  { key: "supplements", label: "Vitamins & supplements" },
  { key: "injectables", label: "Injections, insulin pens & needles" },
  { key: "controlled",  label: "Controlled medicines (strong painkillers, sedatives)" },
  { key: "hazardous",   label: "Chemotherapy & other hazardous medicines" },
  { key: "other",       label: "Other / not sure" }
];

var DOSAGE_FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Drops", "Cream", "Ointment", "Gel",
  "Inhaler", "Nasal spray", "Injection", "Pre-filled pen", "Patch", "Suppository", "Powder", "Other"];

function categoryLabel(key) {
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].key === key) return CATEGORIES[i].label;
  }
  return "Unknown";
}

/* Simple one-way hash so plain passwords are never stored (passwordHash attribute).
   A production build would hash on the Java server with a slow, salted algorithm. */
function hashPassword(text) {
  var h1 = 0x811c9dc5, h2 = 0x01000193;
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return "h$" + h1.toString(16) + h2.toString(16) + text.length.toString(16);
}

/* ---------------------------------------------------------------- User */
class User {
  constructor(r) {
    this.userId = r.userId;
    this.fullName = r.fullName;
    this.email = r.email;
    this.passwordHash = r.passwordHash;
    this.accountStatus = r.accountStatus || "Active";
    this.role = r.role;                       // Household | Staff | Admin
    this.facilityId = r.facilityId || null;   // staff only
    this.createdAt = r.createdAt || new Date().toISOString();
    /* the screens this user's object talks back to – not stored in the database */
    Object.defineProperty(this, "ui", { value: null, writable: true, enumerable: false });
  }
  /* + login(): boolean */
  login(email, password) {
    return this.email.toLowerCase() === String(email).trim().toLowerCase() &&
      this.passwordHash === hashPassword(password) &&
      this.accountStatus === "Active";
  }
}

/* -------------------------------------------------------- HouseholdUser */
class HouseholdUser extends User {
  constructor(r) {
    super(r);
    this.role = "Household";
    this.phoneNumber = r.phoneNumber || "";
    /* where the user is inside a use case (the lifeline's state between messages) – not stored */
    Object.defineProperty(this, "interaction", { value: {}, writable: true, enumerable: false });
  }

  /* ===== SD UC-01 Register Medicine ===== */

  /* registerMedicine() → showRegistrationOptions() */
  registerMedicine() {
    this.interaction = { task: "register", method: "Manual", photo: "" };
    this.ui.showRegistrationOptions();
  }
  /* alt [Manual entry]: enterMedicineDetails(details) → showEnteredDetails(details) */
  enterMedicineDetails(details) {
    this.interaction.method = "Manual";       /* typed by the user (a photo they chose may still be kept as a thumbnail) */
    this.ui.showEnteredDetails(details);
  }
  /* alt [AI-assisted entry]: identifyMedicine(photo) → AI API recognizeMedicine(photo) → identifiedDetails
     → showIdentifiedDetails(details). Also the class-diagram identifyMedicine(): String */
  identifyMedicine(photo) {
    var self = this;
    this.interaction.method = "AI";
    this.interaction.photo = photo.thumb || "";
    return AIRecognitionAPI.recognizeMedicine(photo).then(function (identifiedDetails) {
      self.ui.showIdentifiedDetails(identifiedDetails);
      return identifiedDetails;
    });
  }
  /* confirmDetails(details) → medicine1.verifyDetails(details) → verificationResult
     alt [Valid details]: medicine1.saveMedicine(details) → registrationConfirmed → showConfirmation()
     alt [Invalid details]: showValidationError()  (the user then sends correctDetails(details)) */
  confirmDetails(details) {
    var medicine1 = new Medicine({ userId: this.userId, registrationMethod: this.interaction.method, medicineImage: this.interaction.photo });
    var verificationResult = medicine1.verifyDetails(details);
    if (verificationResult.valid) {
      var registrationConfirmed = medicine1.saveMedicine(details);
      if (registrationConfirmed) this.ui.showConfirmation(medicine1);
      return registrationConfirmed;
    }
    this.ui.showValidationError(verificationResult.errors, details);
    return false;
  }
  /* correctDetails(details): the corrected details go through the same verification again */
  correctDetails(details) {
    return this.confirmDetails(details);
  }

  /* ===== SD UC-02 View Disposal Guidance ===== */

  /* viewDisposalGuidance() → medicine1.getRegisteredMedicines() → medicinelist
     alt [No registered Medicine]: showNoMedicineMessage   [Registered Medicine]: ShowMedicineList() */
  viewDisposalGuidance() {
    this.interaction = { task: "guidance" };
    var medicinelist = Medicine.getRegisteredMedicines(this.userId);
    if (medicinelist.length === 0) this.ui.showNoMedicineMessage();
    else this.ui.showMedicineList(medicinelist);
  }

  /* selectMedicine(medicineID) – sent in both SD UC-02 and SD UC-03; what follows depends on
     which interaction the user is in. */
  selectMedicine(medicineID) {
    switch (this.interaction.task) {
      case "guidance": {
        /* getMedicine(medicineID) → MedicineDetails */
        var MedicineDetails = Medicine.getMedicine(medicineID, this.userId);
        if (!MedicineDetails) return;
        /* GetDisposalGuidance(medicine details) → guidanceDetails */
        var guidanceDetails = DisposalGuidance.getDisposalGuidance(MedicineDetails);
        /* alt [Guidance Unavailable] */
        if (!guidanceDetails) { this.ui.showUnavailableMessage(MedicineDetails); return; }
        /* alt [Guidance Available]: CheckSpecialHandling(MedicineDetails) → Warning Status */
        var warningStatus = guidanceDetails.checkSpecialHandling(MedicineDetails);
        if (warningStatus.warning) this.ui.showDisposalInstructionsAndWarning(MedicineDetails, guidanceDetails, warningStatus.message);
        else this.ui.showDisposalInstructions(MedicineDetails, guidanceDetails);
        return;
      }
      case "return": {
        /* SD UC-03: selectMedicine(medicineID) → requestLocation() */
        var medicine = Medicine.getMedicine(medicineID, this.userId);
        if (!medicine) return;
        this.interaction.medicineID = medicine.medicineId;
        this.interaction.facilityID = null;
        this.ui.requestLocation(medicine);
        return;
      }
    }
  }

  /* ===== SD UC-03 Submit Return Request ===== */

  /* submitReturnRequest() → medicine1.getRegisteredMedicines() → medicinelist → showMedicineList() */
  submitReturnRequest() {
    this.interaction = { task: "return", medicineID: null, facilityID: null, location: null };
    var medicinelist = Medicine.getRegisteredMedicines(this.userId);
    this.ui.showMedicineList(medicinelist);
  }
  /* enterLocation(location) → facility1.searchFacilities(location) → matchingFacilities → showMatchingFacilities() */
  enterLocation(location) {
    this.interaction.location = location;
    this.interaction.facilityID = null;
    var matchingFacilities = CollectionFacility.searchFacilities(location);
    this.ui.showMatchingFacilities(matchingFacilities, Medicine.getMedicine(this.interaction.medicineID, this.userId));
  }
  /* selectFacility(facilityID) → showRequestDetails() */
  selectFacility(facilityID) {
    this.interaction.facilityID = Number(facilityID);
    this.ui.showRequestDetails(Medicine.getMedicine(this.interaction.medicineID, this.userId), CollectionFacility.getFacility(facilityID));
  }
  /* confirmReturnRequest() → returnRequest1.validateRequest(medicineID, facilityID) → validationResult
     alt [Valid Request]: returnRequest1.saveRequest() → requestID, Pending → showRequestConfirmation()
     alt [Invalid Request]: showValidationError() */
  confirmReturnRequest() {
    var medicineID = this.interaction.medicineID, facilityID = this.interaction.facilityID;
    var returnRequest1 = new ReturnRequest({ medicineId: medicineID, facilityId: facilityID });
    var validationResult = returnRequest1.validateRequest(medicineID, facilityID, this.userId);
    if (validationResult.valid) {
      var saved = returnRequest1.saveRequest();
      this.ui.showRequestConfirmation(saved.requestID, saved.status, returnRequest1);
      return saved;
    }
    this.ui.showValidationError(validationResult.errors);
    return null;
  }

  /* Class diagram: + searchFacilities(): List – used by the Collection points page (UC-04).
     It asks CollectionFacility, the same object the SD sends searchFacilities(location) to. */
  searchFacilities(location) {
    return CollectionFacility.searchFacilities(location);
  }
}

/* -------------------------------------------------------- FacilityStaff */
class FacilityStaff extends User {
  constructor(r) {
    super(r);
    this.role = "Staff";
    this.employeeCode = r.employeeCode || "";
  }
  /* + reviewReturnRequest(): accept or reject a Pending request at this staff member's facility (UC-06) */
  reviewReturnRequest(requestId, decision, reason) {
    var req = Store.findRequest(requestId);
    if (!req || req.facilityId !== this.facilityId) return { ok: false, errors: ["This request isn't assigned to your facility."] };
    if (decision === "Rejected" && !String(reason || "").trim()) return { ok: false, errors: ["Tell the household why the request was declined."] };
    var res = req.updateStatus(decision);
    if (!res.ok) return res;
    req.reviewedBy = this.userId;
    req.reviewedAt = new Date().toISOString();
    req.rejectionReason = decision === "Rejected" ? reason.trim() : "";
    Store.save();
    return { ok: true, request: req };
  }
  /* + confirmReceipt(): marks an Accepted request as Completed and stamps receivedAt (UC-07) */
  confirmReceipt(requestId) {
    var req = Store.findRequest(requestId);
    if (!req || req.facilityId !== this.facilityId) return { ok: false, errors: ["This request isn't assigned to your facility."] };
    var res = req.updateStatus("Completed");
    if (!res.ok) return res;
    req.receivedAt = new Date().toISOString();
    req.reviewedBy = this.userId;
    Store.save();
    return { ok: true, request: req };
  }
}

/* -------------------------------------------------------- Administrator */
class Administrator extends User {
  constructor(r) {
    super(r);
    this.role = "Admin";
    this.adminLevel = r.adminLevel || "Full";
  }
  /* + manageUsers(): change account status, role or assigned facility (UC-08) */
  manageUsers(userId, changes) {
    var u = Store.findUser(userId);
    if (!u) return { ok: false, errors: ["Account not found."] };
    if (u.userId === this.userId && (changes.accountStatus === "Suspended" || (changes.role && changes.role !== "Admin"))) {
      return { ok: false, errors: ["You can't suspend or demote your own account."] };
    }
    if (changes.role === "Staff" && !changes.facilityId) {
      return { ok: false, errors: ["Facility staff must be assigned to a collection point."] };
    }
    var rec = Object.assign({}, u, changes);
    if (rec.role !== "Staff") rec.facilityId = null;
    Store.replaceUser(Store.makeUser(rec));
    Store.save();
    return { ok: true };
  }
  /* + manageFacilities(): add, edit, deactivate or reactivate a collection point (UC-09) */
  manageFacilities(action, data) {
    if (action === "deactivate" || action === "activate") {
      var f = Store.findFacility(data.facilityId);
      if (!f) return { ok: false, errors: ["Collection point not found."] };
      f.status = action === "deactivate" ? "Inactive" : "Active";
      Store.save();
      return { ok: true, facility: f };
    }
    var fac = new CollectionFacility(data);
    var check = fac.validate();
    if (!check.valid) return { ok: false, errors: check.errors };
    if (action === "add") {
      fac.facilityId = Store.nextId("facilities");
      Store.tables.facilities.push(fac);
    } else {
      var list = Store.tables.facilities;
      for (var i = 0; i < list.length; i++) {
        if (list[i].facilityId === fac.facilityId) { fac.status = list[i].status; list[i] = fac; }
      }
    }
    Store.save();
    return { ok: true, facility: fac };
  }
}

/* -------------------------------------------------------------- Medicine */
class Medicine {
  constructor(r) {
    this.medicineId = r.medicineId || null;
    this.userId = r.userId;
    this.guidanceId = r.guidanceId || null;
    this.medicineName = String(r.medicineName || "").trim();
    this.medicineCategory = r.medicineCategory || "";
    this.dosage = String(r.dosage || "").trim();          // strength, e.g. 500 mg
    this.dosageForm = r.dosageForm || "";
    this.quantity = r.quantity;
    this.expiryDate = r.expiryDate || "";
    this.medicineImage = r.medicineImage || "";
    this.registrationMethod = r.registrationMethod || "Manual";
    this.registeredAt = r.registeredAt || new Date().toISOString();
  }

  /* SD UC-02 / UC-03: getRegisteredMedicines() → medicinelist (newest first) */
  static getRegisteredMedicines(userId) {
    return Store.tables.medicines
      .filter(function (m) { return m.userId === userId; })
      .sort(function (a, b) { return b.medicineId - a.medicineId; });
  }
  /* SD UC-02: getMedicine(medicineID) → MedicineDetails (only the owner's own medicine) */
  static getMedicine(medicineID, userId) {
    var m = Store.findMedicine(medicineID);
    return m && (userId === undefined || m.userId === userId) ? m : null;
  }

  /* SD UC-01: verifyDetails(details) → verificationResult.
     Class diagram: + verifyDetails(): boolean – `valid` is that boolean; `errors` says what to fix. */
  verifyDetails(details) {
    if (details) {
      this.medicineName = String(details.medicineName || "").trim();
      this.dosage = String(details.dosage || "").trim();
      this.dosageForm = details.dosageForm || "";
      this.medicineCategory = details.medicineCategory || "";
      this.quantity = details.quantity;
      this.expiryDate = details.expiryDate || "";
    }
    var errors = [];
    if (this.medicineName.length < 2) errors.push({ field: "medicineName", msg: "Enter the medicine name as it appears on the box." });
    if (!this.dosage) errors.push({ field: "dosage", msg: "Enter the strength, for example 500 mg or 5 mg/ml." });
    if (!this.dosageForm) errors.push({ field: "dosageForm", msg: "Choose the form, such as tablet or syrup." });
    if (!this.medicineCategory) errors.push({ field: "medicineCategory", msg: "Choose the type of medicine so we can show the right disposal advice." });
    var q = Number(this.quantity);
    if (this.quantity === "" || this.quantity === null || this.quantity === undefined || isNaN(q) || q <= 0 || Math.floor(q) !== q) {
      errors.push({ field: "quantity", msg: "Quantity must be a whole number above zero." });
    } else this.quantity = q;
    if (!this.expiryDate || isNaN(Date.parse(this.expiryDate))) errors.push({ field: "expiryDate", msg: "Enter the expiry date printed on the pack." });
    return { valid: errors.length === 0, errors: errors };
  }

  /* SD UC-01: saveMedicine(details) → registrationConfirmed.
     Saves the verified record, linked to the user and to its disposal guidance. */
  saveMedicine(details) {
    if (!this.verifyDetails(details).valid) return false;
    this.medicineId = Store.nextId("medicines");
    this.guidanceId = Store.guidanceIdFor(this.medicineCategory);
    this.registeredAt = new Date().toISOString();
    Store.tables.medicines.push(this);
    Store.save();
    return true;
  }

  isExpired() { return this.expiryDate && new Date(this.expiryDate) < new Date(new Date().toDateString()); }
}

/* --------------------------------------------------------- ReturnRequest */
var REQUEST_FLOW = { Pending: ["Accepted", "Rejected"], Accepted: ["Completed"], Rejected: [], Completed: [] };

class ReturnRequest {
  constructor(r) {
    this.requestId = r.requestId || null;
    this.medicineId = r.medicineId;
    this.facilityId = r.facilityId;
    this.requestStatus = r.requestStatus || "Pending";
    this.requestedAt = r.requestedAt || new Date().toISOString();
    this.reviewedBy = r.reviewedBy || null;
    this.reviewedAt = r.reviewedAt || null;
    this.receivedAt = r.receivedAt || null;
    this.rejectionReason = r.rejectionReason || "";
  }
  get code() { return "R" + String(this.requestId).padStart(3, "0"); }

  /* SD UC-03: validateRequest(medicineID, facilityID) → validationResult.
     Checks (FR-10, NFR-10): both chosen, medicine is the user's, facility is active,
     facility accepts this type of medicine, no open request for the same medicine. */
  validateRequest(medicineID, facilityID, userId) {
    var errors = [];
    var med = medicineID ? Store.findMedicine(medicineID) : null;
    var fac = facilityID ? Store.findFacility(facilityID) : null;
    if (!medicineID) errors.push("Choose the medicine you want to return.");
    else if (!med || med.userId !== userId) errors.push("That medicine isn't in your account.");
    if (!facilityID) errors.push("Choose a collection point.");
    else if (!fac || fac.status !== "Active") errors.push("That collection point isn't accepting returns right now.");
    if (med && fac && fac.acceptedCategories.indexOf(med.medicineCategory) === -1) {
      errors.push(fac.facilityName + " doesn't accept " + categoryLabel(med.medicineCategory).toLowerCase() + ". Please pick another collection point.");
    }
    var open = med ? Store.openRequestFor(med.medicineId) : null;
    if (open) errors.push("You already have an open return request (" + open.code + ") for " + med.medicineName + ".");
    return { valid: errors.length === 0, errors: errors };
  }

  /* SD UC-03: saveRequest() → requestID, Pending */
  saveRequest() {
    this.requestId = Store.nextId("requests");
    this.requestStatus = "Pending";
    this.requestedAt = new Date().toISOString();
    Store.tables.requests.push(this);
    Store.save();
    return { requestID: this.requestId, code: this.code, status: this.requestStatus };
  }

  /* Class diagram: + updateStatus() – only Pending→Accepted/Rejected and Accepted→Completed */
  updateStatus(newStatus) {
    var allowed = REQUEST_FLOW[this.requestStatus] || [];
    if (allowed.indexOf(newStatus) === -1) {
      return { ok: false, errors: ["A " + this.requestStatus.toLowerCase() + " request can't be changed to " + newStatus.toLowerCase() + "."] };
    }
    this.requestStatus = newStatus;
    return { ok: true };
  }
}

/* ---------------------------------------------------- CollectionFacility */
class CollectionFacility {
  constructor(r) {
    this.facilityId = r.facilityId;
    this.facilityName = String(r.facilityName || "").trim();
    this.address = String(r.address || "").trim();
    this.area = String(r.area || "").trim();
    this.city = r.city || "";
    this.contactNumber = String(r.contactNumber || "").trim();
    this.openDays = r.openDays || [0, 1, 2, 3, 4, 5, 6];  // 0 = Sunday
    this.opens = r.opens || "";
    this.closes = r.closes || "";
    this.acceptedCategories = r.acceptedCategories || [];
    this.lat = Number(r.lat) || null;
    this.lng = Number(r.lng) || null;
    this.status = r.status || "Active";
  }

  /* SD UC-03: searchFacilities(location) → matchingFacilities.
     location is { area: "Al Barsha" } or { coords: {lat, lng} }; only Active facilities are returned. */
  static searchFacilities(location) {
    var list = Store.activeFacilities();
    var result = [];
    location = location || {};
    if (location.coords) {
      for (var i = 0; i < list.length; i++) {
        result.push({ facility: list[i], distance: distanceKm(location.coords, list[i]) });
      }
      result.sort(function (a, b) { return a.distance - b.distance; });
      return result;
    }
    var term = String(location.area || "").trim().toLowerCase();
    var ref = AREA_POINTS[term];
    for (var j = 0; j < list.length; j++) {
      var f = list[j];
      var text = (f.area + " " + f.city + " " + f.facilityName + " " + f.address).toLowerCase();
      if (term === "" || text.indexOf(term) !== -1) {
        result.push({ facility: f, distance: ref ? distanceKm(ref, f) : null });
      }
    }
    if (ref) result.sort(function (a, b) { return a.distance - b.distance; });
    return result;
  }
  static getFacility(facilityID) { return Store.findFacility(facilityID); }

  validate() {
    var e = [];
    if (this.facilityName.length < 3) e.push({ field: "facilityName", msg: "Enter the collection point's name." });
    if (this.address.length < 5) e.push({ field: "address", msg: "Enter the street address." });
    if (!this.area) e.push({ field: "area", msg: "Enter the area or neighbourhood." });
    if (!this.city) e.push({ field: "city", msg: "Choose the city." });
    if (!this.openDays.length) e.push({ field: "openDays", msg: "Pick at least one opening day." });
    if (!this.opens || !this.closes || this.opens >= this.closes) e.push({ field: "opens", msg: "Opening time must be earlier than closing time." });
    if (!this.acceptedCategories.length) e.push({ field: "acceptedCategories", msg: "Tick at least one type of medicine this point accepts." });
    if (this.contactNumber && !/^[+0-9 ()-]{7,20}$/.test(this.contactNumber)) e.push({ field: "contactNumber", msg: "Enter a valid phone number." });
    return { valid: e.length === 0, errors: e };
  }
  hoursText() {
    var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var d = this.openDays.slice().sort();
    var days = d.length === 7 ? "Every day" : d.map(function (n) { return names[n]; }).join(", ");
    return days + ", " + this.opens + "–" + this.closes;
  }
  isOpenNow(now) {
    now = now || new Date();
    var hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    return this.openDays.indexOf(now.getDay()) !== -1 && hm >= this.opens && hm < this.closes;
  }
  /* Class diagram: + getFacilityDetails(): String */
  getFacilityDetails() {
    return this.facilityName + " — " + this.address + ", " + this.area + ", " + this.city + ". " + this.hoursText();
  }
}

/* ------------------------------------------------------ DisposalGuidance */
class DisposalGuidance {
  constructor(r) {
    this.guidanceId = r.guidanceId;
    this.medicineCategory = r.medicineCategory;
    this.instructions = r.instructions;      // array of steps
    this.specialHandling = !!r.specialHandling;
    this.warningMessage = r.warningMessage || "";
  }

  /* SD UC-02: GetDisposalGuidance(medicine details) → guidanceDetails (null = unavailable) */
  static getDisposalGuidance(medicineDetails) {
    var rows = Store.tables.guidance;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].guidanceId === medicineDetails.guidanceId || rows[i].medicineCategory === medicineDetails.medicineCategory) return rows[i];
    }
    return null;
  }

  /* SD UC-02: CheckSpecialHandling(MedicineDetails) → Warning Status */
  checkSpecialHandling(medicineDetails) {
    var applies = this.specialHandling && this.medicineCategory === medicineDetails.medicineCategory;
    return { warning: applies, message: applies ? this.warningMessage : "" };
  }

  /* Class diagram: + getDisposalGuidance(): String – the instructions as one text */
  getDisposalGuidance() { return this.instructions.join(" "); }
}

/* Approximate centre points of supported areas, used to order results by distance */
var AREA_POINTS = {
  "abu dhabi": { lat: 24.4539, lng: 54.3773 }, "al markaziyah": { lat: 24.4930, lng: 54.3650 },
  "khalifa city": { lat: 24.4190, lng: 54.5760 }, "Mussafah": { lat: 24.3500, lng: 54.5000 },
  "dubai": { lat: 25.2048, lng: 55.2708 }, "al barsha": { lat: 25.1110, lng: 55.1990 },
  "deira": { lat: 25.2700, lng: 55.3100 }, "jumeirah": { lat: 25.2090, lng: 55.2490 },
  "sharjah": { lat: 25.3463, lng: 55.4209 }, "al majaz": { lat: 25.3230, lng: 55.3850 },
  "al ain": { lat: 24.2075, lng: 55.7447 }, "al jimi": { lat: 24.2420, lng: 55.7300 }
};

/* Great-circle distance in km (haversine formula) */
function distanceKm(a, b) {
  var R = 6371, toRad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
  var h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
