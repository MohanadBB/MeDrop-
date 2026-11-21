/* ==========================================================================
   MedDrop – application layer (pages, routing, validation)
   Use cases implemented here (report §13):
   UC01 Register Medicine · UC02 View Disposal Guidance · UC03 Submit Return Request
   UC04 Search Collection Facilities · UC05 Track Return Status · UC06 Review Return Request
   UC07 Confirm Medicine Receipt · UC08 Manage User Accounts · UC09 Manage Collection Facilities
   UC10 Identify Medicine using AI (extends UC01)
   The household pages follow the message order of Sequence Diagrams SD UC-01, UC-02 and UC-03.
   ========================================================================== */
{
  Store.load();

  /* ------------------------------------------------------------ helpers */
  var app = document.getElementById("app");
  var state = { guideMed: null, startMed: null, presetFacility: null, regTab: "manual", staffFilter: "Pending", adminReqFilter: "All", userQuery: "", facQuery: "", facResults: null, facFilter: "" };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return fmtDate(iso) + ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  function stamp(status) { return '<span class="stamp s-' + esc(status) + '">' + esc(statusText(status)) + "</span>"; }
  function statusText(s) {
    switch (s) {
      case "Pending": return "Waiting for review";
      case "Accepted": return "Accepted – ready to drop off";
      case "Completed": return "Received";
      case "Rejected": return "Declined";
      default: return s;
    }
  }
  function firstName(u) { return u.fullName.split(" ")[0]; }

  var I = {
    pill: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="M9.2 7.8l5.6 8.4" /></svg>',
    box: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>',
    pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    alert: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    ok: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
    camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    pen: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    sparkle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/></svg>'
  };
  function alertBox(kind, title, body) {
    var icon = kind === "error" || kind === "warn" ? I.alert : kind === "ok" ? I.ok : I.info;
    return '<div class="alert ' + kind + '" role="' + (kind === "error" ? "alert" : "status") + '">' + icon + "<div><b>" + title + "</b>" + (body ? "<p>" + body + "</p>" : "") + "</div></div>";
  }
  function errorList(errors) {
    var items = errors.map(function (e) { return "<li>" + esc(e.msg || e) + "</li>"; }).join("");
    return '<div class="alert error" role="alert">' + I.alert + "<div><b>Please fix the following before continuing:</b><ul>" + items + "</ul></div></div>";
  }
  /* NFR-07: show a clear message and mark the fields; nothing is saved */
  function showErrors(form, box, errors) {
    $all(".invalid", form).forEach(function (el) { el.classList.remove("invalid"); el.removeAttribute("aria-invalid"); });
    if (!errors.length) { box.innerHTML = ""; return; }
    box.innerHTML = errorList(errors);
    var first = null;
    errors.forEach(function (e) {
      if (!e.field) return;
      var el = form.querySelector('[name="' + e.field + '"]');
      if (el) { el.classList.add("invalid"); el.setAttribute("aria-invalid", "true"); if (!first) first = el; }
    });
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    if (first && first.focus) first.focus({ preventScroll: true });
  }
  function toast(msg, bad) {
    var t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function openModal(html, wide) {
    var m = $("#modal");
    m.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="box' + (wide ? " wide" : "") + '">' + html + "</div></div>";
    var box = $(".box", m);
    $(".modal", m).addEventListener("click", function (e) { if (e.target.classList.contains("modal")) closeModal(); });
    var f = box.querySelector("input, select, textarea, button");
    if (f) f.focus();
    return box;
  }
  function closeModal() { $("#modal").innerHTML = ""; }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  function confirmBox(title, body, okText, onOk, danger) {
    var box = openModal("<h2>" + title + "</h2><p>" + body + '</p><div class="row end"><button class="btn ghost" data-x>Cancel</button><button class="btn' + (danger ? " warn" : "") + '" data-ok>' + okText + "</button></div>");
    $("[data-x]", box).onclick = closeModal;
    $("[data-ok]", box).onclick = function () { closeModal(); onOk(); };
  }
  function formData(form) {
    var out = {};
    $all("input, select, textarea", form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") {
        if (!out[el.name]) out[el.name] = [];
        if (el.checked) out[el.name].push(el.value);
      } else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  }
  function categoryOptions(selected) {
    return '<option value="">Choose a type…</option>' + CATEGORIES.map(function (c) {
      return '<option value="' + c.key + '"' + (c.key === selected ? " selected" : "") + ">" + esc(c.label) + "</option>";
    }).join("");
  }
  function areaDatalist(id) {
    var names = {};
    Store.activeFacilities().forEach(function (f) { names[f.area] = 1; names[f.city] = 1; });
    return '<datalist id="' + id + '">' + Object.keys(names).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
  }
  function medIcon(m) {
    if (m.medicineImage) return '<span class="ico"><img src="' + esc(m.medicineImage) + '" alt=""></span>';
    return '<span class="ico">' + I.pill + "</span>";
  }
  function medLine(m) { return esc(m.dosage) + " · " + esc(m.dosageForm) + " · Qty " + esc(m.quantity); }
  function expiryNote(m) {
    if (m.isExpired()) return '<span class="stamp s-Expired">Expired ' + fmtDate(m.expiryDate) + "</span>";
    return '<span class="small muted">Expires ' + fmtDate(m.expiryDate) + "</span>";
  }

  /* ------------------------------------------------------------ session (FR-02, NFR-04) */
  var current = null;
  function loadSession() {
    var id = null;
    try { id = sessionStorage.getItem("meddrop.session"); } catch (e) { id = null; }
    var u = id ? Store.findUser(Number(id)) : null;
    current = u && u.accountStatus === "Active" ? u : null;
    if (current && current.role === "Household") current.ui = HouseholdScreens;
  }
  function setSession(u) {
    current = u;
    if (u && u.role === "Household") u.ui = HouseholdScreens;
    try { if (u) sessionStorage.setItem("meddrop.session", u.userId); else sessionStorage.removeItem("meddrop.session"); } catch (e) { /* in-memory only */ }
  }
  function homeFor(u) {
    switch (u.role) {
      case "Household": return "my-home";
      case "Staff": return "staff-home";
      case "Admin": return "admin-home";
    }
    return "home";
  }
  function go(route) {
    if (location.hash === "#" + route) render(); else location.hash = route;
  }

  /* ------------------------------------------------------------ routes */
  var ROUTES = {
    "home": { role: null, view: viewHome },
    "login": { role: null, view: viewLogin },
    "signup": { role: null, view: viewSignup },
    "my-home": { role: "Household", view: viewHouseholdHome, nav: "Home" },
    "register-medicine": { role: "Household", view: viewRegister, nav: "Register medicine" },
    "guidance": { role: "Household", view: viewGuidance, nav: "Disposal guidance" },
    "facilities": { role: "Household", view: viewFacilities, nav: "Collection points" },
    "my-requests": { role: "Household", view: viewRequests, nav: "My requests" },
    "staff-home": { role: "Staff", view: viewStaffHome, nav: "Dashboard" },
    "staff-requests": { role: "Staff", view: viewStaffRequests, nav: "Requests" },
    "staff-receipt": { role: "Staff", view: viewStaffReceipt, nav: "Confirm receipt" },
    "admin-home": { role: "Admin", view: viewAdminHome, nav: "Dashboard" },
    "admin-users": { role: "Admin", view: viewAdminUsers, nav: "Users" },
    "admin-facilities": { role: "Admin", view: viewAdminFacilities, nav: "Collection points" },
    "admin-requests": { role: "Admin", view: viewAdminRequests, nav: "Return records" }
  };
  var PORTAL = { Household: "Household", Staff: "Facility staff", Admin: "Administrator" };

  function renderNav(route) {
    var nav = $("#nav"), html = "";
    if (!current) {
      html = '<a href="#home"' + (route === "home" ? ' class="on"' : "") + '>Home</a><a href="#login"' + (route === "login" ? ' class="on"' : "") + '>Sign in</a><a class="cta" href="#signup">Create account</a>';
      $("#portalName").textContent = "Safe medicine return";
    } else {
      for (var key in ROUTES) {
        if (ROUTES[key].role === current.role) html += '<a href="#' + key + '"' + (key === route ? ' class="on" aria-current="page"' : "") + ">" + ROUTES[key].nav + "</a>";
      }
      html += '<span class="who"><b>' + esc(current.fullName) + "</b>" + PORTAL[current.role] + '</span><button type="button" id="signout">Sign out</button>';
      $("#portalName").textContent = PORTAL[current.role] + " portal";
    }
    nav.innerHTML = html;
    var so = $("#signout");
    if (so) so.onclick = function () { setSession(null); toast("You've signed out."); go("home"); };
  }

  function render() {
    loadSession();
    var route = location.hash.replace("#", "") || (current ? homeFor(current) : "home");
    var r = ROUTES[route];
    if (!r) { route = current ? homeFor(current) : "home"; r = ROUTES[route]; }
    if (r.role && !current) { state.afterLogin = route; route = "login"; r = ROUTES.login; state.loginNote = "Please sign in to continue."; }
    else if (r.role && current.role !== r.role) {
      /* NFR-04: a page for another role is never shown */
      route = homeFor(current); r = ROUTES[route];
      toast("That page isn't available for your account.", true);
    } else if (!r.role && current && (route === "login" || route === "signup")) { route = homeFor(current); r = ROUTES[route]; }
    renderNav(route);
    closeModal();
    app.innerHTML = "";
    r.view();
    labelTables();
    if (route !== lastRoute) { app.focus({ preventScroll: true }); window.scrollTo(0, 0); }
    lastRoute = route;
  }
  var lastRoute = null;
  /* On phones each table row becomes a card; give every cell its column name */
  function labelTables() {
    $all("table.stack").forEach(function (t) {
      var heads = $all("thead th", t).map(function (th) { return th.textContent; });
      $all("tbody tr", t).forEach(function (tr) {
        for (var i = 0; i < tr.cells.length; i++) tr.cells[i].setAttribute("data-l", heads[i] || "");
      });
    });
  }
  window.addEventListener("hashchange", render);

  /* ==================================================================== PUBLIC */
  function heroArt() {
    return '<svg viewBox="0 0 520 420" role="img" aria-label="Medicines being dropped into a MedDrop return box">' +
      '<defs><linearGradient id="gF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9efe6"/></linearGradient>' +
      '<linearGradient id="gS" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bfe3d5"/><stop offset="1" stop-color="#9fd2bf"/></linearGradient>' +
      '<linearGradient id="gB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcf7a"/><stop offset="1" stop-color="#e79a1c"/></linearGradient></defs>' +
      '<circle cx="270" cy="210" r="190" fill="#0f6f5a"/><circle cx="270" cy="210" r="140" fill="#127a63"/>' +
      '<ellipse cx="262" cy="392" rx="170" ry="16" fill="#073f33" opacity=".55"/>' +
      /* box: side, front, top, slot */
      '<path d="M372 196l52-30v178l-52 40z" fill="url(#gS)"/>' +
      '<rect x="112" y="196" width="260" height="188" rx="10" fill="url(#gF)"/>' +
      '<path d="M112 196l54-30h258l-52 30z" fill="#effaf5"/>' +
      '<path d="M196 182l14-8h132l-14 8z" fill="#0b3b30"/>' +
      '<rect x="146" y="236" width="192" height="104" rx="10" fill="#0b5d4b"/>' +
      '<rect x="168" y="262" width="16" height="52" rx="3" fill="#fff"/><rect x="150" y="280" width="52" height="16" rx="3" fill="#fff"/>' +
      '<text x="220" y="282" fill="#fff" font-family="Figtree,system-ui,sans-serif" font-size="19" font-weight="800">MEDICINE</text>' +
      '<text x="220" y="306" fill="#bfeee0" font-family="Figtree,system-ui,sans-serif" font-size="19" font-weight="700">RETURN</text>' +
      /* blister pack */
      '<g transform="translate(206 68) rotate(-18)"><rect width="96" height="62" rx="8" fill="#e8eef0"/><rect width="96" height="62" rx="8" fill="none" stroke="#b9c7cc" stroke-width="2"/>' +
      '<g fill="#fff" stroke="#c7d3d7" stroke-width="2"><ellipse cx="22" cy="18" rx="11" ry="8"/><ellipse cx="48" cy="18" rx="11" ry="8"/><ellipse cx="74" cy="18" rx="11" ry="8"/><ellipse cx="22" cy="44" rx="11" ry="8"/><ellipse cx="48" cy="44" rx="11" ry="8"/></g></g>' +
      /* bottle */
      '<g transform="translate(314 40) rotate(16)"><rect x="6" y="0" width="34" height="16" rx="4" fill="#0b5d4b"/><rect x="0" y="14" width="46" height="74" rx="10" fill="url(#gB)"/><rect x="6" y="34" width="34" height="30" rx="4" fill="#fff8ea"/><rect x="12" y="42" width="22" height="4" rx="2" fill="#e79a1c"/><rect x="12" y="51" width="16" height="4" rx="2" fill="#f2c27a"/></g>' +
      /* capsules falling */
      '<g transform="translate(164 140) rotate(30)"><rect width="34" height="14" rx="7" fill="#ffffff"/><rect width="17" height="14" rx="7" fill="#ff8f7a"/></g>' +
      '<g transform="translate(372 132) rotate(-40)"><rect width="30" height="12" rx="6" fill="#ffffff"/><rect x="15" width="15" height="12" rx="6" fill="#4fc3a1"/></g>' +
      /* status card */
      '<g transform="translate(26 54)"><rect width="168" height="66" rx="14" fill="#ffffff"/><circle cx="32" cy="33" r="15" fill="#e3f2ec"/><path d="M25 33l5 5 9-10" fill="none" stroke="#0b5d4b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<text x="56" y="29" font-family="Figtree,system-ui,sans-serif" font-size="13" fill="#5a6b65" font-weight="600">Request R005</text><text x="56" y="48" font-family="Figtree,system-ui,sans-serif" font-size="15" fill="#0b5d4b" font-weight="800">Received</text></g>' +
      '</svg>';
  }

  function viewHome() {
    var facs = Store.activeFacilities();
    var cities = {};
    facs.forEach(function (f) { cities[f.city] = 1; });
    var cta = current
      ? '<a class="btn light" href="#' + homeFor(current) + '">Go to my dashboard</a>'
      : '<a class="btn light" href="#signup">Create a free account</a><a class="btn ghost" style="color:#fff;border-color:rgb(255 255 255 / .4)" href="#login">Sign in</a>';
    app.innerHTML =
      '<section class="hero"><div class="wrap"><div>' +
      "<h1>Return unused medicines the safe way</h1>" +
      '<p class="lead">Old and expired medicines don\'t belong in the bin or down the sink. MedDrop shows you how to get rid of each one safely, finds a collection point near you, and lets you follow your return until it\'s received.</p>' +
      '<div class="row">' + cta + "</div></div>" +
      '<div class="fig">' + heroArt() + "</div></div></section>" +
      '<section class="factband"><div class="wrap"><div class="big">74%</div><p>of people asked in a 2025 UAE study said they throw unused medicines away with household rubbish – and only 5.9% return them to a pharmacy. Medicines kept at home or thrown away can be taken by accident, misused, or end up in soil and water.</p></div></section>' +
      '<section class="band"><div class="wrap"><h2 id="how">How MedDrop works</h2><p class="muted">Four short steps from your medicine cabinet to a safe return.</p>' +
      '<ol class="howgrid">' +
      '<li><div class="n">1</div><h3>Add your medicine</h3><p class="muted">Type in the details, or take a photo of the box and we\'ll read the name, strength and expiry date for you to check.</p></li>' +
      '<li><div class="n">2</div><h3>See how to dispose of it</h3><p class="muted">Get clear instructions for that type of medicine, with warnings for needles, controlled and hazardous medicines.</p></li>' +
      '<li><div class="n">3</div><h3>Pick a collection point</h3><p class="muted">Search your area to find points that are open and accept your type of medicine, then send a return request.</p></li>' +
      '<li><div class="n">4</div><h3>Drop it off and track it</h3><p class="muted">Follow your request from review to drop-off. When staff confirm they\'ve received it, you\'re done.</p></li>' +
      "</ol></div></section>" +
      '<section class="band" style="padding-top:0"><div class="wrap"><h2>One place for everyone in the return</h2>' +
      '<div class="roles">' +
      '<div class="role"><h3>For households</h3><ul><li>Keep a list of medicines to return</li><li>Safe disposal advice for each one</li><li>Collection points in ' + Object.keys(cities).join(", ") + "</li><li>Request tracking</li></ul>" + (current ? "" : '<a class="btn" href="#signup">Create account</a>') + "</div>" +
      '<div class="role"><h3>For collection staff</h3><ul><li>See requests sent to your collection point</li><li>Accept or decline with a reason</li><li>Confirm when medicines arrive</li></ul>' + (current ? "" : '<a class="btn ghost" href="#login">Staff sign in</a>') + "</div>" +
      '<div class="role"><h3>For administrators</h3><ul><li>Manage user accounts and roles</li><li>Add and update collection points</li><li>Review all return records</li></ul>' + (current ? "" : '<a class="btn ghost" href="#login">Admin sign in</a>') + "</div>" +
      "</div></div></section>" +
      '<section class="band promise"><div class="wrap"><h2>Your information stays yours</h2><div class="grid">' +
      "<div><b>Only what's needed</b>We ask for your name, email and the medicines you're returning – never your medical history.</div>" +
      "<div><b>You check the AI</b>When we read a photo of your medicine, you review and correct every detail before anything is saved.</div>" +
      "<div><b>The right eyes only</b>Collection staff see only the requests sent to their collection point, and the connection is encrypted.</div>" +
      "</div></div></section>" +
      '<section class="band"><div class="wrap" style="max-width:860px"><h2>Common questions</h2>' +
      "<details><summary>Can I just flush old medicines or put them in the bin?</summary><p>Please don't. Flushed medicines reach water and soil, and medicines in household rubbish can be found by children, pets or other people. Returning them to a collection point is the safest option.</p></details>" +
      "<details><summary>What can I return?</summary><p>Tablets, capsules, syrups, creams, inhalers, antibiotics and supplements are accepted at most points. Needles, controlled and hazardous medicines need special handling and are only accepted at some points – MedDrop shows you which.</p></details>" +
      "<details><summary>Does the photo feature always get it right?</summary><p>No – photos can be blurry or the print small. That's why you always see what was read and can correct it before saving.</p></details>" +
      "<details><summary>What happens after I send a request?</summary><p>Staff at the collection point review it. Once accepted, take your medicine there during opening hours and quote your request ID. They'll confirm receipt and your request shows as Received.</p></details>" +
      "</div></section>";
  }

  /* -------------------------------------------------- login (FR-02) */
  function viewLogin() {
    var note = state.loginNote; state.loginNote = "";
    var demos = [
      ["sara@example.com", "Sara Al Mansoori", "Household user"],
      ["khalid@meddrop.ae", "Khalid Rahman", "Facility staff · Central Collection Point"],
      ["admin@meddrop.ae", "Layla Nasser", "Administrator"]
    ];
    app.innerHTML = '<div class="wrap page"><div class="auth">' +
      '<section class="card"><h1 style="font-size:34px">Sign in</h1><p class="muted">Households, collection staff and administrators all sign in here.</p>' +
      (note ? alertBox("info", note) : "") + '<div id="loginErr"></div>' +
      '<form id="loginForm" novalidate><div class="field"><label class="req" for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required autofocus placeholder="you@example.com"></div>' +
      '<div class="field"><label class="req" for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn" type="submit">Sign in</button><span class="small muted">New here? <a href="#signup">Create an account</a></span></div></form></section>' +
      '<aside class="card demo"><h3>Try MedDrop</h3><p class="small muted">Sign in with a sample account to see each portal. Password for all: <b>' + DEMO_PASSWORD + "</b></p>" +
      demos.map(function (d) { return '<button class="btn ghost" data-demo="' + d[0] + '"><div><b>' + d[1] + "</b><span>" + d[2] + "</span></div></button>"; }).join("") +
      "</aside></div></div>";
    var form = $("#loginForm");
    form.onsubmit = function (e) {
      e.preventDefault();
      var d = formData(form), errs = [];
      if (!/^\S+@\S+\.\S+$/.test(d.email)) errs.push({ field: "email", msg: "Enter the email address you registered with." });
      if (!d.password) errs.push({ field: "password", msg: "Enter your password." });
      if (errs.length) return showErrors(form, $("#loginErr"), errs);
      var u = Store.findUserByEmail(d.email);
      if (u && u.passwordHash === hashPassword(d.password) && u.accountStatus !== "Active") {
        return showErrors(form, $("#loginErr"), [{ msg: "This account is suspended. Please contact MedDrop support." }]);
      }
      if (!u || !u.login(d.email, d.password)) {
        return showErrors(form, $("#loginErr"), [{ field: "password", msg: "That email and password don't match our records." }]);
      }
      setSession(u);
      toast("Welcome back, " + firstName(u) + ".");
      var next = state.afterLogin && ROUTES[state.afterLogin] && ROUTES[state.afterLogin].role === u.role ? state.afterLogin : homeFor(u);
      state.afterLogin = null;
      go(next);
    };
    $all("[data-demo]").forEach(function (b) {
      b.onclick = function () { $("#email").value = b.dataset.demo; $("#password").value = DEMO_PASSWORD; form.requestSubmit(); };
    });
  }

  /* -------------------------------------------------- sign up (FR-01, NFR-05) */
  function viewSignup() {
    app.innerHTML = '<div class="wrap page"><div class="auth">' +
      '<section class="card"><h1 style="font-size:34px">Create your account</h1><p class="muted">It takes a minute. We only ask for what we need to arrange your returns – never your medical history.</p>' +
      '<div id="suErr"></div><form id="suForm" novalidate><div class="grid2">' +
      '<div class="field full"><label class="req" for="fullName">Full name</label><input id="fullName" name="fullName" autocomplete="name" required autofocus placeholder="e.g. Sara Al Mansoori"></div>' +
      '<div class="field"><label class="req" for="suEmail">Email</label><input id="suEmail" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>' +
      '<div class="field"><label for="phone">Mobile number <span class="muted small">(optional)</span></label><input id="phone" name="phoneNumber" type="tel" autocomplete="tel" placeholder="+971 50 123 4567"></div>' +
      '<div class="field"><label class="req" for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="new-password" required minlength="8"><span class="hint">At least 8 characters, with a letter and a number.</span></div>' +
      '<div class="field"><label class="req" for="pw2">Confirm password</label><input id="pw2" name="password2" type="password" autocomplete="new-password" required></div>' +
      '<label class="check field full"><input type="checkbox" name="agree" value="yes"> <span>I understand MedDrop stores my details and medicine list only to arrange returns, and that photo recognition uses an AI service.</span></label>' +
      '</div><div class="row" style="margin-top:14px"><button class="btn" type="submit">Create account</button><span class="small muted">Already registered? <a href="#login">Sign in</a></span></div></form></section>' +
      '<aside class="card"><h3>What you can do once you\'re in</h3><ul class="muted"><li>Add medicines by typing or with a photo</li><li>Get disposal advice for each medicine</li><li>Find collection points near you</li><li>Send and track return requests</li></ul>' +
      '<p class="small muted">Collection staff and administrator accounts are set up by MedDrop administrators.</p></aside></div></div>';
    var form = $("#suForm");
    form.onsubmit = function (e) {
      e.preventDefault();
      var d = formData(form), errs = [];
      if (d.fullName.trim().length < 3) errs.push({ field: "fullName", msg: "Enter your full name." });
      if (!/^\S+@\S+\.\S+$/.test(d.email)) errs.push({ field: "email", msg: "Enter a valid email address." });
      else if (Store.findUserByEmail(d.email)) errs.push({ field: "email", msg: "An account with this email already exists. Try signing in." });
      if (d.phoneNumber && !/^[+0-9 ()-]{7,20}$/.test(d.phoneNumber)) errs.push({ field: "phoneNumber", msg: "Enter a valid mobile number, or leave it empty." });
      if (d.password.length < 8 || !/[A-Za-z]/.test(d.password) || !/[0-9]/.test(d.password)) errs.push({ field: "password", msg: "Your password needs at least 8 characters, including a letter and a number." });
      if (d.password !== d.password2) errs.push({ field: "password2", msg: "The two passwords don't match." });
      if (!d.agree.length) errs.push({ field: "agree", msg: "Please confirm you understand how your details are used." });
      if (errs.length) return showErrors(form, $("#suErr"), errs);
      var u = new HouseholdUser({ userId: Store.nextId("users"), fullName: d.fullName.trim(), email: d.email.trim(), phoneNumber: d.phoneNumber.trim(), passwordHash: hashPassword(d.password) });
      Store.tables.users.push(u);
      Store.save();
      setSession(u);
      state.welcome = true;
      go("my-home");
    };
  }

  /* ==================================================================== HOUSEHOLD */
  function myMeds() { return Medicine.getRegisteredMedicines(current.userId); }

  function viewHouseholdHome() {
    var meds = myMeds(), reqs = Store.requestsFor(current);
    var count = { Pending: 0, Accepted: 0, Completed: 0, Rejected: 0 };
    for (var i = 0; i < reqs.length; i++) count[reqs[i].requestStatus]++;
    var expired = meds.filter(function (m) { return m.isExpired(); }).length;
    var accepted = reqs.filter(function (r) { return r.requestStatus === "Accepted"; });
    var html = '<div class="wrap page"><div class="pagehead"><div><h1>Hello, ' + esc(firstName(current)) + "</h1><p>Here's where your medicine returns stand.</p></div>" +
      '<div class="row"><a class="btn" href="#register-medicine">Add a medicine</a><a class="btn ghost" href="#my-requests">New return request</a></div></div>';
    if (state.welcome) { html += alertBox("ok", "Your account is ready.", "Start by adding a medicine you'd like to return."); state.welcome = false; }
    accepted.forEach(function (r) {
      var m = Store.findMedicine(r.medicineId), f = Store.findFacility(r.facilityId);
      html += alertBox("info", "Ready to drop off: " + esc(m.medicineName), "Take it to " + esc(f.facilityName) + " (" + esc(f.hoursText()) + ") and quote request <b>" + r.code + "</b>.");
    });
    html += '<div class="stats">' +
      '<div class="stat"><b>' + meds.length + "</b><span>Medicines in my list</span></div>" +
      '<div class="stat amber"><b>' + count.Pending + "</b><span>Waiting for review</span></div>" +
      '<div class="stat"><b>' + count.Accepted + "</b><span>Ready to drop off</span></div>" +
      '<div class="stat"><b>' + count.Completed + "</b><span>Returned safely</span></div></div>";
    html += '<div class="cols"><section class="card"><h2>My medicines</h2>';
    if (!meds.length) html += '<div class="empty">' + I.box + '<p>You haven\'t added any medicines yet.</p><a class="btn" href="#register-medicine">Add your first medicine</a></div>';
    else {
      if (expired) html += alertBox("warn", expired + (expired === 1 ? " medicine has" : " medicines have") + " expired.", "Expired medicines should be returned rather than kept or thrown away.");
      html += '<div class="list">' + meds.map(function (m) {
        var r = Store.latestRequestFor(m.medicineId);
        return '<div class="item">' + medIcon(m) + '<div class="body"><b>' + esc(m.medicineName) + '</b><span class="small muted">' + medLine(m) + "</span><br>" + expiryNote(m) + "</div>" +
          '<div class="row">' + (r ? stamp(r.requestStatus) : "") + '<button class="btn small ghost" data-guide="' + m.medicineId + '">Advice</button>' +
          (!Store.openRequestFor(m.medicineId) && !(r && r.requestStatus === "Completed") ? '<button class="btn small" data-return="' + m.medicineId + '">Return</button>' : "") + "</div></div>";
      }).join("") + "</div>";
    }
    html += '</section><section class="card"><h2>Recent requests</h2>';
    if (!reqs.length) html += '<p class="muted">No return requests yet. When you send one, you can follow it here.</p>';
    else html += reqs.slice(0, 4).map(function (r) { return requestSummary(r); }).join('<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">') + '<p style="margin-top:14px"><a href="#my-requests">See all requests</a></p>';
    html += "</section></div></div>";
    app.innerHTML = html;
    bindMedButtons();
  }
  function bindMedButtons() {
    $all("[data-guide]").forEach(function (b) { b.onclick = function () { state.guideMed = Number(b.dataset.guide); go("guidance"); }; });
    $all("[data-return]").forEach(function (b) { b.onclick = function () { startRequest(Number(b.dataset.return)); }; });
  }
  function timeline(r) {
    var steps = [["Requested", r.requestedAt], [r.requestStatus === "Rejected" ? "Declined" : "Accepted", r.reviewedAt], ["Received", r.receivedAt]];
    var reached = { Pending: 1, Accepted: 2, Rejected: 2, Completed: 3 }[r.requestStatus];
    var out = '<ol class="timeline">';
    for (var i = 0; i < steps.length; i++) {
      var cls = i < reached ? (r.requestStatus === "Rejected" && i === 1 ? "done bad" : "done") : "";
      if (r.requestStatus === "Rejected" && i === 2) cls = "";
      out += '<li class="' + cls + '">' + steps[i][0] + (i < reached && steps[i][1] ? "<small>" + fmtDate(steps[i][1]) + "</small>" : "") + "</li>";
    }
    return out + "</ol>";
  }
  function requestSummary(r) {
    var m = Store.findMedicine(r.medicineId), f = Store.findFacility(r.facilityId);
    return '<div><div class="row" style="justify-content:space-between"><b>' + r.code + " · " + esc(m.medicineName) + "</b>" + stamp(r.requestStatus) + '</div><span class="small muted">' + esc(f.facilityName) + ", " + esc(f.city) + "</span>" + timeline(r) +
      (r.requestStatus === "Rejected" && r.rejectionReason ? '<p class="small"><b>Reason:</b> ' + esc(r.rejectionReason) + "</p>" : "") + "</div>";
  }

  /* ==================================================================== HOUSEHOLD SCREENS
     The household pages never change data themselves. They send the actor's messages from the
     sequence diagrams to the signed-in HouseholdUser object (current.registerMedicine(),
     current.selectMedicine(id)…), and the object answers by calling one of the "show…"
     functions below – the dashed return arrows back to the Household User in each SD. */
  var HouseholdScreens = {
    /* ---- SD UC-01 ---- */
    showRegistrationOptions: function () { drawRegistrationOptions(); },
    showEnteredDetails: function (details) { drawEnteredDetails(details); },
    showIdentifiedDetails: function (details) { drawRegForm(details, "ai", []); toast("Package read – please check the details."); },
    showConfirmation: function (medicine) { drawRegistrationConfirmed(medicine); },
    /* showValidationError() appears in SD UC-01 and SD UC-03 */
    showValidationError: function (errors, details) {
      switch (current.interaction.task) {
        case "register": drawRegForm(details, "correct", errors); break;
        case "return": $("#wizErr").innerHTML = errorList(errors); $("#wizErr").scrollIntoView({ behavior: "smooth", block: "center" }); break;
      }
    },
    /* ---- SD UC-02 (showMedicineList also SD UC-03) ---- */
    showNoMedicineMessage: function () { drawNoMedicines(); },
    showMedicineList: function (medicinelist) {
      switch (current.interaction.task) {
        case "guidance": drawGuidanceList(medicinelist); break;
        case "return": drawReturnMedicineList(medicinelist); break;
      }
    },
    showUnavailableMessage: function (medicine) { drawGuidance(medicine, null, ""); },
    showDisposalInstructionsAndWarning: function (medicine, guidance, warning) { drawGuidance(medicine, guidance, warning); },
    showDisposalInstructions: function (medicine, guidance) { drawGuidance(medicine, guidance, ""); },
    /* ---- SD UC-03 ---- */
    requestLocation: function (medicine) { drawRequestLocation(medicine); },
    showMatchingFacilities: function (matching, medicine) { drawMatchingFacilities(matching, medicine); },
    showRequestDetails: function (medicine, facility) { drawRequestDetails(medicine, facility); },
    showRequestConfirmation: function (requestID, status) { drawRequestConfirmation(requestID, status); }
  };

  /* -------------------------------------------------- UC01 Register Medicine (+ UC10 AI) */
  function viewRegister() {
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>Add a medicine</h1><p>Add a medicine you want to return. You can type the details or take a photo of the box.</p></div></div><div id="regArea"></div></div>';
    current.registerMedicine();                       /* SD UC-01: registerMedicine() */
  }
  function regHelp() {
    return '<aside class="card"><h3>Where to find the details</h3><ul class="muted small"><li><b>Name and strength</b> are printed large on the front, e.g. “Amoxicillin 250 mg”.</li><li><b>Form</b> is what it is: tablet, syrup, cream, inhaler…</li><li><b>Expiry date</b> is often stamped on a side flap as EXP.</li><li><b>Quantity</b> is how many packs or bottles you\'re returning.</li></ul>' +
      alertBox("info", "Not sure of the type?", "Choose the closest match. Needles, controlled and chemotherapy medicines need special handling, so pick those if they apply.") + "</aside>";
  }
  /* showRegistrationOptions(): manual and AI-assisted options */
  function drawRegistrationOptions() {
    var tab = state.regTab;
    $("#regArea").innerHTML = '<div class="tabs" role="tablist"><button role="tab" aria-selected="' + (tab === "manual") + '" data-tab="manual">' + I.pen + "Type the details</button>" +
      '<button role="tab" aria-selected="' + (tab === "ai") + '" data-tab="ai">' + I.camera + "Use a photo of the box</button></div>" +
      '<div class="cols"><section class="card" id="regMain"></section>' + regHelp() + "</div>";
    $all("[data-tab]").forEach(function (b) { b.onclick = function () { state.regTab = b.dataset.tab; current.registerMedicine(); }; });
    if (tab === "ai") { $("#regMain").innerHTML = aiPanel(); bindAi(); }
    else { $("#regMain").innerHTML = medicineFormHtml({}, "manual"); bindRegForm("manual"); }
  }
  /* mode: "manual" (→ enterMedicineDetails), "ai" (identified, → confirmDetails), "correct" (→ correctDetails) */
  function drawRegForm(d, mode, errors) {
    $("#regArea").innerHTML = '<div class="cols"><section class="card" id="regMain">' + medicineFormHtml(d || {}, mode) + "</section>" + regHelp() + "</div>";
    bindRegForm(mode);
    if (errors && errors.length) showErrors($("#medForm"), $("#medErr"), errors);
  }
  function medicineFormHtml(d, mode) {
    var ai = mode === "ai" || (mode === "correct" && current.interaction.method === "AI");
    var miss = function (k) { return mode === "ai" && !d[k] ? " invalid" : ""; };
    var photo = current.interaction.photo;
    var top = "";
    if (mode === "ai") top = '<div class="preview" style="margin-bottom:14px">' + (photo ? '<img src="' + photo + '" alt="Your medicine photo">' : "") +
      '<div><span class="aibadge">' + I.sparkle + 'Read from your photo</span><p class="small" style="margin:8px 0 0">Please check every field against the box and correct anything that\'s wrong. Fields we couldn\'t read are outlined in red.</p></div></div>';
    if (mode === "correct") top = "<h2>Correct the details</h2>";
    if (mode === "manual" && photo) top = '<div class="preview" style="margin-bottom:14px"><img src="' + photo + '" alt="Your medicine photo" style="width:180px;height:180px"><p class="small" style="margin:0;flex:1">Type the details as they appear on your photo.</p></div>';
    var confirm = mode === "manual" ? "" : '<label class="check field full" style="margin-top:4px"><input type="checkbox" name="checked" value="yes"> <span>I\'ve checked these details against the package.</span></label>';
    var button = mode === "manual" ? "Review details" : mode === "ai" ? "Confirm and save" : "Save corrected details";
    return top + '<div id="medErr"></div><form id="medForm" novalidate><div class="grid2">' +
      '<div class="field full"><label class="req" for="mName">Medicine name</label><input id="mName" name="medicineName" list="medNames" required autofocus placeholder="e.g. Paracetamol" value="' + esc(d.medicineName) + '" class="' + miss("medicineName") + '">' +
      '<datalist id="medNames"><option value="Paracetamol"><option value="Ibuprofen"><option value="Amoxicillin"><option value="Cetirizine"><option value="Omeprazole"><option value="Metformin"><option value="Salbutamol inhaler"><option value="Insulin pen"></datalist></div>' +
      '<div class="field"><label class="req" for="mDose">Strength</label><input id="mDose" name="dosage" required placeholder="e.g. 500 mg" value="' + esc(d.dosage) + '" class="' + miss("dosage") + '"></div>' +
      '<div class="field"><label class="req" for="mForm">Form</label><select id="mForm" name="dosageForm" required class="' + miss("dosageForm") + '"><option value="">Choose…</option>' +
      DOSAGE_FORMS.map(function (f) { return "<option" + (f === d.dosageForm ? " selected" : "") + ">" + f + "</option>"; }).join("") + "</select></div>" +
      '<div class="field full"><label class="req" for="mCat">Type of medicine</label><select id="mCat" name="medicineCategory" required class="' + miss("medicineCategory") + '">' + categoryOptions(d.medicineCategory) + '</select><span class="hint">This decides the disposal advice and which collection points can take it.</span></div>' +
      '<div class="field"><label class="req" for="mQty">Quantity (packs or bottles)</label><input id="mQty" name="quantity" type="number" min="1" step="1" inputmode="numeric" required value="' + esc(d.quantity == null ? 1 : d.quantity) + '" class="' + miss("quantity") + '"></div>' +
      '<div class="field"><label class="req" for="mExp">Expiry date</label><input id="mExp" name="expiryDate" type="date" required value="' + esc(d.expiryDate) + '" class="' + miss("expiryDate") + '"></div>' +
      confirm + '</div><div class="row" style="margin-top:16px"><button class="btn" type="submit">' + button + "</button>" +
      (ai ? '<button class="btn ghost" type="button" id="retake">Use a different photo</button>' : "") + "</div></form>";
  }
  function bindRegForm(mode) {
    var form = $("#medForm");
    form.onsubmit = function (e) {
      e.preventDefault();
      var d = formData(form);
      var details = { medicineName: d.medicineName, dosage: d.dosage, dosageForm: d.dosageForm, medicineCategory: d.medicineCategory, quantity: d.quantity, expiryDate: d.expiryDate };
      if (mode !== "manual" && !(d.checked || []).length) return showErrors(form, $("#medErr"), [{ field: "checked", msg: "Tick the box to confirm you've checked the details against the package." }]);
      switch (mode) {
        case "manual": current.enterMedicineDetails(details); break;   /* SD: enterMedicineDetails(details) */
        case "ai": current.confirmDetails(details); break;            /* SD: confirmDetails(details) */
        case "correct": current.correctDetails(details); break;       /* SD: correctDetails(details) */
      }
    };
    var rt = $("#retake");
    if (rt) rt.onclick = function () { state.regTab = "ai"; current.registerMedicine(); };
  }
  /* showEnteredDetails(details): the user verifies, then confirmDetails(details) */
  function drawEnteredDetails(d) {
    var v = function (x) { return x ? esc(x) : '<span class="muted">Not entered</span>'; };
    $("#regArea").innerHTML = '<section class="card" style="max-width:720px"><h2>Check your medicine</h2><p class="muted">Make sure these details match the box. You can go back and change anything.</p>' +
      '<div id="revErr"></div><dl class="kv"><dt>Name</dt><dd>' + v(d.medicineName) + "</dd><dt>Strength</dt><dd>" + v(d.dosage) + "</dd><dt>Form</dt><dd>" + v(d.dosageForm) + "</dd><dt>Type</dt><dd>" + (d.medicineCategory ? esc(categoryLabel(d.medicineCategory)) : v("")) +
      "</dd><dt>Quantity</dt><dd>" + v(d.quantity) + "</dd><dt>Expiry date</dt><dd>" + (d.expiryDate ? fmtDate(d.expiryDate) : v("")) + "</dd></dl>" +
      '<label class="check" style="margin:16px 0"><input type="checkbox" id="confirmOk"> <span>I\'ve checked these details against the package.</span></label>' +
      '<div class="row"><button class="btn" id="saveMed">Confirm and save</button><button class="btn ghost" id="editMed">Change details</button></div></section>';
    $("#editMed").onclick = function () { drawRegForm(d, "manual", []); };
    $("#saveMed").onclick = function () {
      if (!$("#confirmOk").checked) { $("#revErr").innerHTML = errorList(["Tick the box to confirm you've checked the details."]); return; }
      current.confirmDetails(d);                       /* SD: confirmDetails(details) */
    };
  }
  /* showConfirmation(): registration confirmed */
  function drawRegistrationConfirmed(m) {
    var g = DisposalGuidance.getDisposalGuidance(m), w = g ? g.checkSpecialHandling(m) : { warning: false };
    $("#regArea").innerHTML = '<section class="card" style="max-width:720px">' + alertBox("ok", esc(m.medicineName) + " has been added to your list.", "You can now see how to dispose of it or send a return request.") +
      (w.warning ? alertBox("warn", "This medicine needs special handling.", esc(w.message)) : "") +
      '<div class="row"><button class="btn" id="dGuide">See disposal advice</button><button class="btn ghost" id="dReturn">Return it now</button><button class="btn ghost" id="dMore">Add another medicine</button></div></section>';
    $("#dGuide").onclick = function () { state.guideMed = m.medicineId; go("guidance"); };
    $("#dReturn").onclick = function () { startRequest(m.medicineId); };
    $("#dMore").onclick = function () { current.registerMedicine(); };
  }

  /* ---- UC10 Identify Medicine using AI (extends UC01) ---- */
  var SAMPLE_PACKS = [
    { label: "Cetirizine box", color: "#2f6fd1", name: "Cetirizine", line: "10 mg · 30 tablets", exp: "EXP 03/2026",
      result: { recognized: true, medicineName: "Cetirizine", dosage: "10 mg", dosageForm: "Tablet", medicineCategory: "tablets", quantity: 1, expiryDate: "2026-03-31" } },
    { label: "Cough syrup", color: "#c2410c", name: "Dextromethorphan", line: "15 mg/5 ml · syrup", exp: "EXP 09/2025",
      result: { recognized: true, medicineName: "Dextromethorphan cough syrup", dosage: "15 mg/5 ml", dosageForm: "Syrup", medicineCategory: "liquids", quantity: 1, expiryDate: "2025-09-30" } },
    { label: "Omeprazole (date hidden)", color: "#7c3aed", name: "Omeprazole", line: "20 mg · capsules", exp: "",
      result: { recognized: true, medicineName: "Omeprazole", dosage: "20 mg", dosageForm: "Capsule", medicineCategory: "tablets", quantity: 1, expiryDate: "" } },
    { label: "Blurry photo", color: "#64748b", name: "", line: "", exp: "", blur: true, result: { recognized: false } }
  ];
  function packSvg(p) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="#e9eef0"/>' +
      (p.blur ? '<filter id="b"><feGaussianBlur stdDeviation="9"/></filter><g filter="url(#b)">' : "<g>") +
      '<rect x="24" y="52" width="192" height="136" rx="8" fill="#fff" stroke="#cfd8dc" stroke-width="2"/><rect x="24" y="52" width="192" height="34" rx="8" fill="' + p.color + '"/>' +
      '<text x="120" y="76" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700" fill="#fff">' + (p.name || "Medicine") + "</text>" +
      '<text x="120" y="120" text-anchor="middle" font-family="Arial" font-size="15" fill="#263238">' + p.line + "</text>" +
      '<text x="120" y="168" text-anchor="middle" font-family="Arial" font-size="13" fill="#546e7a">' + p.exp + "</text></g></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }
  function aiPanel() {
    return "<h2>Use a photo of the box</h2><p class=\"muted\">Take or choose a clear photo of the front of the package. We'll read the name, strength and expiry date, then you check them.</p>" +
      '<div id="aiMsg"></div><label class="drop" id="drop"><input type="file" id="aiFile" accept="image/*" capture="environment">' + I.camera +
      '<p style="margin:8px 0 2px"><b>Choose a photo</b> or drop it here</p><span class="hint">JPG or PNG, up to 10 MB</span></label>' +
      '<div id="aiPreview"></div><p class="small muted" style="margin-top:16px">No box to hand? Try a sample photo:</p><div class="samples">' +
      SAMPLE_PACKS.map(function (p, i) { return '<button type="button" data-sample="' + i + '"><img src="' + packSvg(p) + '" alt="">' + esc(p.label) + "</button>"; }).join("") + "</div>" +
      '<p class="small muted" style="margin-top:16px">Your photo is sent to an AI recognition service only to read the package text. It is kept as a small thumbnail with your medicine.</p>';
  }
  function bindAi() {
    var input = $("#aiFile"), drop = $("#drop");
    input.onchange = function () { if (input.files[0]) choosePhoto(input.files[0]); };
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) choosePhoto(e.dataTransfer.files[0]); });
    $all("[data-sample]").forEach(function (b) { b.onclick = function () { choosePhoto(null, SAMPLE_PACKS[Number(b.dataset.sample)]); }; });
  }
  function choosePhoto(file, sample) {
    $("#aiMsg").innerHTML = "";
    if (file && (!/^image\//.test(file.type) || file.size > 10 * 1024 * 1024)) {
      $("#aiMsg").innerHTML = alertBox("error", "That file can't be used.", "Choose a JPG or PNG photo under 10 MB.");
      return;
    }
    var url = sample ? packSvg(sample) : URL.createObjectURL(file);
    $("#aiPreview").innerHTML = '<div class="card" style="margin-top:16px;box-shadow:none"><div class="preview"><img src="' + url + '" alt="Selected photo"><div style="flex:1">' +
      '<p style="margin:0 0 10px"><b>Photo ready.</b> We\'ll read the package text.</p><div id="aiProg" class="hidden"><progress max="100" value="10"></progress><p class="small muted" id="aiStage">Reading the package…</p></div>' +
      '<div class="row" id="aiBtns"><button class="btn" id="aiGo">' + I.sparkle + ' Read the package</button></div></div></div></div>';
    $("#aiGo").onclick = function () { runRecognition(file, sample, url); };
  }
  function thumbnail(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement("canvas"), s = 96;
          c.width = s; c.height = s;
          var k = Math.max(s / img.width, s / img.height), w = img.width * k, h = img.height * k;
          c.getContext("2d").drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
          resolve(c.toDataURL("image/jpeg", .75));
        } catch (e) { resolve(""); }
      };
      img.onerror = function () { resolve(""); };
      img.src = src;
    });
  }
  function runRecognition(file, sample, url) {
    var prog = $("#aiProg"), bar = $("progress", prog), stage = $("#aiStage");
    prog.classList.remove("hidden"); $("#aiBtns").classList.add("hidden");
    var pct = 10, timer = setInterval(function () { pct = Math.min(92, pct + 6); bar.value = pct; if (pct > 50) stage.textContent = "Matching the medicine details…"; }, 300);
    thumbnail(url).then(function (thumb) {
      /* SD: identifyMedicine(photo) → recognizeMedicine(photo) → showIdentifiedDetails(details) */
      return current.identifyMedicine({ file: file, sample: sample, thumb: thumb });
    }).then(function () { clearInterval(timer); }).catch(function (err) {
      /* FR-04: the photo could not be recognised – show an error and offer manual entry */
      clearInterval(timer);
      prog.classList.add("hidden"); $("#aiBtns").classList.remove("hidden");
      var msg, offer = "Type the details instead";
      switch (err && err.code) {
        case "offline_copy": msg = alertBox("error", "Photo reading isn't switched on on this device yet.", "A MedDrop administrator can switch it on from the Administrator dashboard. For now, type the details while looking at your photo."); offer = "Type the details next to my photo"; break;
        case "bad_key": msg = alertBox("error", "Photo reading couldn't sign in to the recognition service.", "A MedDrop administrator needs to check the key on the Administrator dashboard. For now, type the details while looking at your photo."); offer = "Type the details next to my photo"; break;
        case "unavailable": msg = alertBox("error", "Photo reading isn't available right now.", "The recognition service didn't respond. Try again in a moment, or type the details while looking at your photo."); offer = "Type the details next to my photo"; break;
        case "not_granted": msg = alertBox("error", "Photo reading wasn't allowed.", "MedDrop needs your permission to send the photo to the recognition service. Choose “Try again” and allow it, or type the details yourself."); offer = "Type the details next to my photo"; break;
        case "no_key": msg = alertBox("error", "Photo reading isn't switched on for this site yet.", "The site's administrator needs to add the AI service key. For now, type the details while looking at your photo."); offer = "Type the details next to my photo"; break;
        case "no_images": msg = alertBox("error", "Photo reading isn't available on this account.", "You can type the details while looking at your photo."); offer = "Type the details next to my photo"; break;
        case "rate_limited": msg = alertBox("error", "Too many photos at once.", "Please wait a moment and try again, or type the details."); break;
        default: msg = alertBox("error", "We couldn't recognise this package.", "Try a sharper photo of the front of the box in good light, or type the details yourself.");
      }
      $("#aiMsg").innerHTML = msg + '<div class="row" style="margin:-6px 0 14px"><button class="btn small ghost" id="toManual">' + offer + "</button>" + (sample ? "" : '<button class="btn small ghost" id="aiRetry">Try again</button>') + "</div>";
      $("#aiMsg").scrollIntoView({ behavior: "smooth", block: "nearest" });
      var retry = $("#aiRetry");
      if (retry) retry.onclick = function () { $("#aiMsg").innerHTML = ""; runRecognition(file, sample, url); };
      /* keep the photo on screen (and as the medicine's thumbnail) while the user types */
      $("#toManual").onclick = function () {
        if (sample) { state.regTab = "manual"; current.registerMedicine(); return; }
        thumbnail(url).then(function (thumb) { current.interaction.photo = thumb; drawRegForm({}, "manual", []); });
      };
    });
  }

  /* -------------------------------------------------- UC02 View Disposal Guidance (FR-06, FR-07) */
  function viewGuidance() {
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>Disposal guidance</h1><p>Choose a medicine to see how to prepare it for return, and anything you need to be careful about.</p></div></div><div id="gArea"></div></div>';
    current.viewDisposalGuidance();                   /* SD UC-02: viewDisposalGuidance() */
    var pick = state.guideMed;
    if (pick && Medicine.getMedicine(pick, current.userId)) current.selectMedicine(pick);   /* SD: selectMedicine(medicineID) */
  }
  /* alt [No registered Medicine]: showNoMedicineMessage */
  function drawNoMedicines() {
    $("#gArea").innerHTML = '<section class="card"><div class="empty">' + I.box + '<h3>No medicines yet</h3><p>Add a medicine first and we\'ll show you how to dispose of it safely.</p><a class="btn" href="#register-medicine">Add a medicine</a></div></section>';
  }
  /* alt [Registered Medicine]: ShowMedicineList() */
  function drawGuidanceList(list) {
    $("#gArea").innerHTML = '<div class="cols" style="grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)"><section class="card"><h3>Your medicines</h3><div class="list">' +
      list.map(function (m) {
        var g = DisposalGuidance.getDisposalGuidance(m);
        return '<button class="item" data-pick="' + m.medicineId + '">' + medIcon(m) + '<span class="body"><b>' + esc(m.medicineName) + '</b><span class="small muted">' + esc(categoryLabel(m.medicineCategory)) + "</span></span>" +
          (g && g.specialHandling ? '<span class="tag warnt">Special handling</span>' : "") + "</button>";
      }).join("") + '</div></section><section class="card guide" id="guidePanel" aria-live="polite"><div class="empty">' + I.info + "<p>Choose a medicine on the left to see its disposal advice.</p></div></section></div>";
    $all("[data-pick]").forEach(function (b) {
      b.onclick = function () {
        state.guideMed = Number(b.dataset.pick);
        current.selectMedicine(state.guideMed);       /* SD: selectMedicine(medicineID) */
        if (innerWidth < 900) $("#guidePanel").scrollIntoView({ behavior: "smooth" });
      };
    });
  }
  /* ShowUnavailableMessage() / showDisposalInstructionsAndWarning / ShowDisposalInstructions() */
  function drawGuidance(m, g, warning) {
    $all("[data-pick]").forEach(function (b) { b.classList.toggle("sel", Number(b.dataset.pick) === m.medicineId); });
    var head = '<div class="row" style="justify-content:space-between"><h2 style="margin:0">' + esc(m.medicineName) + " " + esc(m.dosage) + "</h2>" + expiryNote(m) + '</div><p class="muted">' + esc(m.dosageForm) + " · " + esc(categoryLabel(m.medicineCategory)) + "</p>";
    var html;
    if (!g) {
      html = head + alertBox("warn", "We don't have disposal advice for this type of medicine yet.", "Please ask a pharmacist, or call a collection point before you visit so they can tell you how to bring it.") +
        '<a class="btn ghost" href="#facilities">Find a collection point</a>';
    } else {
      var points = Store.activeFacilities().filter(function (f) { return f.acceptedCategories.indexOf(m.medicineCategory) !== -1; }).length;
      var open = Store.openRequestFor(m.medicineId);
      html = head + (warning ? alertBox("warn", "Special handling needed", esc(warning)) : "") +
        "<h3>How to prepare it</h3><ol>" + g.instructions.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
        alertBox("info", points + " collection point" + (points === 1 ? "" : "s") + " accept this type of medicine.", "Always return medicines to an authorised collection point and follow the staff's instructions.") +
        '<div class="row">' + (open ? '<span class="small muted">Already in request ' + open.code + " – " + statusText(open.requestStatus).toLowerCase() + '.</span><a class="btn ghost" href="#my-requests">Track it</a>' : '<button class="btn" id="gReturn">Return this medicine</button><a class="btn ghost" href="#facilities">See collection points</a>') + "</div>";
    }
    $("#guidePanel").innerHTML = html;
    var rb = $("#gReturn");
    if (rb) rb.onclick = function () { startRequest(m.medicineId); };
  }

  /* -------------------------------------------------- UC04 Search Collection Facilities (FR-08, FR-09) */
  function facilityCard(f, dist, opts) {
    opts = opts || {};
    var accepts = opts.medicine ? f.acceptedCategories.indexOf(opts.medicine.medicineCategory) !== -1 : true;
    var special = f.acceptedCategories.filter(function (c) { return c === "injectables" || c === "controlled" || c === "hazardous"; });
    return '<article class="fac' + (opts.selected ? " sel" : "") + '"><h3>' + esc(f.facilityName) + '</h3><div class="meta">' + I.pin + " " + esc(f.area) + ", " + esc(f.city) + (dist != null ? " · " + dist.toFixed(1) + " km away" : "") + "</div>" +
      '<div class="meta">' + esc(f.hoursText()) + " · " + (f.isOpenNow() ? '<span class="open">Open now</span>' : '<span class="closed">Closed now</span>') + "</div>" +
      "<div>" + (special.length ? special.map(function (c) { return '<span class="tag warnt">Takes ' + esc(categoryLabel(c).split(" (")[0].toLowerCase()) + "</span>"; }).join("") : '<span class="tag">Everyday medicines</span>') + "</div>" +
      (opts.medicine && !accepts ? '<p class="err small" style="margin:0">Doesn\'t accept ' + esc(categoryLabel(opts.medicine.medicineCategory).toLowerCase()) + "</p>" : "") +
      '<div class="foot"><button class="btn small ghost" data-details="' + f.facilityId + '">Details</button>' +
      (opts.pick ? '<button class="btn small" data-choose="' + f.facilityId + '"' + (accepts ? "" : " disabled") + ">" + (opts.selected ? "Selected" : "Choose") + "</button>" : '<button class="btn small" data-returnhere="' + f.facilityId + '">Return here</button>') + "</div></article>";
  }
  function facilityDetails(id) {
    var f = Store.findFacility(id);
    var box = openModal("<h2>" + esc(f.facilityName) + '</h2><p class="muted">' + (f.isOpenNow() ? '<span class="open">Open now</span>' : '<span class="closed">Closed now</span>') + '</p><dl class="kv">' +
      "<dt>Address</dt><dd>" + esc(f.address) + ", " + esc(f.area) + ", " + esc(f.city) + "</dd><dt>Opening hours</dt><dd>" + esc(f.hoursText()) + "</dd><dt>Phone</dt><dd>" + esc(f.contactNumber || "Not listed") +
      "</dd><dt>Accepts</dt><dd>" + f.acceptedCategories.map(function (c) { return '<span class="tag">' + esc(categoryLabel(c)) + "</span>"; }).join("") + "</dd></dl>" +
      '<div class="row end" style="margin-top:18px"><a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(f.address + ", " + f.city + ", UAE") + '" target="_blank" rel="noopener">Open in maps</a><button class="btn" data-x>Close</button></div>', true);
    $("[data-x]", box).onclick = closeModal;
  }
  function searchForm(id, value) {
    return '<form id="' + id + '" class="row" role="search" novalidate style="align-items:flex-end"><div class="field" style="flex:1 1 240px"><label for="' + id + 'Q">Area or city</label>' +
      '<input id="' + id + 'Q" name="area" type="search" list="' + id + 'Areas" placeholder="e.g. Al Barsha, Abu Dhabi" value="' + esc(value || "") + '" autocomplete="off">' + areaDatalist(id + "Areas") + "</div>" +
      '<button class="btn" type="submit">Search</button><button class="btn ghost" type="button" data-geo>' + I.pin + " Use my location</button></form>";
  }
  function useLocation(done) {
    if (!navigator.geolocation) return done(null, "Your browser can't share your location. Type your area instead.");
    navigator.geolocation.getCurrentPosition(function (p) { done({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      function () { done(null, "We couldn't get your location. Type your area or city instead."); }, { timeout: 8000 });
  }
  function viewFacilities() {
    var results = state.facResults || current.searchFacilities({ area: "" });
    var filtered = state.facFilter ? results.filter(function (r) { return r.facility.acceptedCategories.indexOf(state.facFilter) !== -1; }) : results;
    var html = '<div class="wrap page"><div class="pagehead"><div><h1>Collection points</h1><p>Find somewhere near you that accepts your medicines. Search by area or city, or use your location.</p></div></div>' +
      '<section class="card">' + searchForm("fs", state.facQuery) +
      '<div class="field" style="max-width:360px;margin-top:12px"><label for="fFilter">Must accept</label><select id="fFilter">' + categoryOptions(state.facFilter).replace("Choose a type…", "Any type of medicine") + "</select></div><div id=\"fsMsg\"></div></section>";
    if (!filtered.length) html += '<section class="card"><div class="empty">' + I.pin + "<h3>No collection points found" + (state.facQuery ? " in “" + esc(state.facQuery) + "”" : "") + "</h3><p>Try a nearby area or just the city name, such as Dubai or Abu Dhabi.</p></div></section>";
    else html += '<p class="muted" style="margin:0 0 12px">' + filtered.length + " collection point" + (filtered.length === 1 ? "" : "s") + (state.facQuery ? " for “" + esc(state.facQuery) + "”" : "") + '</p><div class="facgrid">' + filtered.map(function (r) { return facilityCard(r.facility, r.distance); }).join("") + "</div>";
    app.innerHTML = html + "</div>";
    $("#fs").onsubmit = function (e) {
      e.preventDefault();
      state.facQuery = $("#fsQ").value.trim();
      state.facResults = current.searchFacilities({ area: state.facQuery });
      render();
    };
    $("#fFilter").onchange = function () { state.facFilter = this.value; render(); };
    $("[data-geo]").onclick = function () {
      $("#fsMsg").innerHTML = '<p class="small muted">Finding your location…</p>';
      useLocation(function (coords, err) {
        if (!coords) { $("#fsMsg").innerHTML = alertBox("warn", err); return; }
        state.facQuery = ""; state.facResults = current.searchFacilities({ coords: coords }); render();
        toast("Showing the nearest collection points first.");
      });
    };
    $all("[data-details]").forEach(function (b) { b.onclick = function () { facilityDetails(Number(b.dataset.details)); }; });
    $all("[data-returnhere]").forEach(function (b) { b.onclick = function () { startRequest(null, Number(b.dataset.returnhere)); }; });
  }

  /* -------------------------------------------------- UC03 Submit Return Request + UC05 Track Return Status */
  /* Other pages open the request page with a medicine (and maybe a collection point) already picked */
  function startRequest(medicineId, facilityId) {
    state.startMed = medicineId || null;
    state.presetFacility = facilityId || null;
    go("my-requests");
  }
  function viewRequests() {
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>Return requests</h1><p>Send a medicine to a collection point and follow it until it\'s received.</p></div></div>' +
      '<section class="card" id="newReq"><h2>New return request</h2><div id="wizard"></div></section><section class="card"><h2>My return requests</h2><div id="history"></div></section></div>';
    drawHistory();
    current.submitReturnRequest();                    /* SD UC-03: submitReturnRequest() */
    if (state.startMed) {
      var id = state.startMed; state.startMed = null;
      current.selectMedicine(id);                     /* SD: selectMedicine(medicineID) */
    }
  }
  function drawHistory() {
    var reqs = Store.requestsFor(current);
    $("#history").innerHTML = !reqs.length ? '<p class="muted">You haven\'t sent any return requests yet.</p>' :
      '<div class="tablewrap"><table class="stack"><thead><tr><th>Request ID</th><th>Medicine</th><th>Collection point</th><th>Sent</th><th>Status</th><th></th></tr></thead><tbody>' +
      reqs.map(function (r) {
        var m = Store.findMedicine(r.medicineId), f = Store.findFacility(r.facilityId);
        return "<tr><td><b>" + r.code + "</b></td><td>" + esc(m.medicineName) + " " + esc(m.dosage) + "</td><td>" + esc(f.facilityName) + '</td><td class="nowrap">' + fmtDate(r.requestedAt) + "</td><td>" + stamp(r.requestStatus) + '</td><td><button class="btn small ghost" data-track="' + r.requestId + '">Track</button></td></tr>';
      }).join("") + "</tbody></table></div>";
    labelTables();
    $all("#history [data-track]").forEach(function (b) { b.onclick = function () { trackModal(Number(b.dataset.track)); }; });
  }
  function trackModal(id) {
    var r = Store.findRequest(id), m = Store.findMedicine(r.medicineId), f = Store.findFacility(r.facilityId);
    var next = { Pending: "Staff at " + f.facilityName + " will review your request. You'll see the result here.", Accepted: "Take your medicine to " + f.facilityName + " during opening hours and quote request " + r.code + ".", Completed: "Your medicine was received. Thank you for returning it safely.", Rejected: "This request was declined. You can choose another collection point and send a new request." }[r.requestStatus];
    var box = openModal('<div class="row" style="justify-content:space-between"><h2 style="margin:0">Request ' + r.code + "</h2>" + stamp(r.requestStatus) + "</div>" + timeline(r) +
      '<p style="margin-top:10px">' + esc(next) + "</p>" + (r.rejectionReason ? alertBox("error", "Reason given by the collection point", esc(r.rejectionReason)) : "") +
      '<dl class="kv"><dt>Medicine</dt><dd>' + esc(m.medicineName) + " · " + medLine(m) + "</dd><dt>Collection point</dt><dd>" + esc(f.getFacilityDetails()) + "</dd><dt>Phone</dt><dd>" + esc(f.contactNumber || "Not listed") + "</dd><dt>Sent</dt><dd>" + fmtDateTime(r.requestedAt) + "</dd>" +
      (r.reviewedAt ? "<dt>Reviewed</dt><dd>" + fmtDateTime(r.reviewedAt) + "</dd>" : "") + (r.receivedAt ? "<dt>Received</dt><dd>" + fmtDateTime(r.receivedAt) + "</dd>" : "") + "</dl>" +
      '<div class="row end" style="margin-top:18px">' + (r.requestStatus === "Rejected" ? '<button class="btn ghost" data-again>Try another point</button>' : "") + '<button class="btn" data-x>Close</button></div>', true);
    $("[data-x]", box).onclick = closeModal;
    var again = $("[data-again]", box);
    if (again) again.onclick = function () { closeModal(); state.startMed = r.medicineId; render(); };
  }
  function wizard(step, inner) {
    var names = ["Medicine", "Your area", "Collection point", "Confirm"];
    $("#wizard").innerHTML = '<ol class="steps">' + names.map(function (n, i) { return '<li class="' + (i + 1 === step ? "on" : i + 1 < step ? "done" : "") + '">' + n + "</li>"; }).join("") + '</ol><div id="wizErr"></div>' + inner;
  }
  /* showMedicineList() – choosing one sends selectMedicine(medicineID) */
  function drawReturnMedicineList(list) {
    if (!list.length) { wizard(1, '<div class="empty">' + I.box + '<p>Add a medicine first, then come back to send it for return.</p><a class="btn" href="#register-medicine">Add a medicine</a></div>'); return; }
    wizard(1, '<h3>Which medicine do you want to return?</h3><div class="list">' + list.map(function (m) {
      var open = Store.openRequestFor(m.medicineId), last = Store.latestRequestFor(m.medicineId);
      var doneAlready = last && last.requestStatus === "Completed";
      return '<button class="item" data-med="' + m.medicineId + '"' + (open || doneAlready ? ' disabled style="opacity:.55;cursor:not-allowed"' : "") + ">" + medIcon(m) +
        '<span class="body"><b>' + esc(m.medicineName) + '</b><span class="small muted">' + medLine(m) + "</span></span>" +
        '<span class="side">' + (open ? "In request " + open.code : doneAlready ? "Already returned" : m.isExpired() ? "Expired" : "Expires " + fmtDate(m.expiryDate)) + "</span></button>";
    }).join("") + "</div>");
    $all("[data-med]").forEach(function (b) { b.onclick = function () { current.selectMedicine(Number(b.dataset.med)); }; });
  }
  /* requestLocation() – the user answers with enterLocation(location) */
  function drawRequestLocation(m) {
    /* Opened from a collection point's "Return here": search that area and pick it straight away */
    if (state.presetFacility) {
      var pf = CollectionFacility.getFacility(state.presetFacility); state.presetFacility = null;
      if (pf && pf.status === "Active" && pf.acceptedCategories.indexOf(m.medicineCategory) !== -1) {
        current.enterLocation({ area: pf.area });
        current.selectFacility(pf.facilityId);
        return;
      }
    }
    var last = current.interaction.location;
    wizard(2, "<h3>Where should we look for collection points?</h3><p class=\"muted\">Returning <b>" + esc(m.medicineName) + "</b> (" + esc(categoryLabel(m.medicineCategory).toLowerCase()) + ").</p>" + searchForm("rs", last && last.area) +
      '<div id="rsMsg"></div><div class="row" style="margin-top:16px"><button class="btn ghost" data-back>Back</button></div>');
    $("[data-back]").onclick = function () { current.submitReturnRequest(); };
    $("#rs").onsubmit = function (e) {
      e.preventDefault();
      var area = $("#rsQ").value.trim();
      if (!area) { $("#rsMsg").innerHTML = errorList(["Type your area or city, or use your location."]); $("#rsQ").classList.add("invalid"); return; }
      current.enterLocation({ area: area });           /* SD: enterLocation(location) */
    };
    $("#rs [data-geo]").onclick = function () {
      $("#rsMsg").innerHTML = '<p class="small muted">Finding your location…</p>';
      useLocation(function (coords, err) {
        if (!coords) { $("#rsMsg").innerHTML = alertBox("warn", err); return; }
        current.enterLocation({ coords: coords });     /* SD: enterLocation(location) */
      });
    };
  }
  /* showMatchingFacilities() – choosing one sends selectFacility(facilityID) */
  function drawMatchingFacilities(res, m) {
    var where = current.interaction.location || {};
    var ok = res.filter(function (r) { return r.facility.acceptedCategories.indexOf(m.medicineCategory) !== -1; }).length;
    wizard(3, '<h3>Choose a collection point</h3><p class="muted">' + (where.area ? "Results for “" + esc(where.area) + "”. " : "Nearest first. ") + ok + " of " + res.length + " accept " + esc(categoryLabel(m.medicineCategory).toLowerCase()) + ".</p>" +
      (!res.length ? alertBox("warn", "No collection points found in this area.", "Go back and try a nearby area or the city name.") :
        '<div class="facgrid">' + res.map(function (r) { return facilityCard(r.facility, r.distance, { pick: true, medicine: m }); }).join("") + "</div>") +
      '<div class="row" style="margin-top:16px"><button class="btn ghost" data-back>Back</button></div>');
    $("[data-back]").onclick = function () { current.selectMedicine(m.medicineId); };
    $all("#wizard [data-choose]").forEach(function (b) { b.onclick = function () { current.selectFacility(Number(b.dataset.choose)); }; });   /* SD: selectFacility(facilityID) */
    $all("#wizard [data-details]").forEach(function (b) { b.onclick = function () { facilityDetails(Number(b.dataset.details)); }; });
  }
  /* showRequestDetails() – the user answers with confirmReturnRequest() */
  function drawRequestDetails(m, f) {
    var g = DisposalGuidance.getDisposalGuidance(m), w = g ? g.checkSpecialHandling(m) : { warning: false };
    wizard(4, "<h3>Check and send your request</h3><dl class=\"kv\"><dt>Medicine</dt><dd>" + esc(m.medicineName) + " · " + medLine(m) + "</dd><dt>Collection point</dt><dd>" + esc(f.facilityName) + "<br><span class=\"small muted\">" + esc(f.address) + ", " + esc(f.area) + ", " + esc(f.city) + "</span></dd>" +
      "<dt>Opening hours</dt><dd>" + esc(f.hoursText()) + "</dd></dl>" + (w.warning ? '<div style="margin-top:16px">' + alertBox("warn", "Remember: special handling", esc(w.message)) + "</div>" : "") +
      '<p class="small muted" style="margin-top:14px">Staff at the collection point will review your request. Once it\'s accepted, take the medicine there and quote your request ID.</p>' +
      '<div class="row" style="margin-top:12px;justify-content:space-between"><button class="btn ghost" data-back>Back</button><button class="btn" id="sendReq">Send request</button></div>');
    $("[data-back]").onclick = function () { current.enterLocation(current.interaction.location); };
    $("#sendReq").onclick = function () { current.confirmReturnRequest(); };   /* SD: confirmReturnRequest() */
  }
  /* showRequestConfirmation() – request ID and Pending status */
  function drawRequestConfirmation(requestID, status) {
    var r = Store.findRequest(requestID), f = Store.findFacility(r.facilityId), m = Store.findMedicine(r.medicineId);
    $("#wizard").innerHTML = '<div class="receipt"><p style="margin:0" class="muted">Your request ID</p><div class="code">' + r.code + '</div><p style="margin:8px 0 12px">' + stamp(status) + "</p><p>" + esc(m.medicineName) + " → " + esc(f.facilityName) + "</p></div>" +
      '<p style="margin-top:14px">We\'ve sent your request to <b>' + esc(f.facilityName) + "</b>. You'll see here when they accept it – then take your medicine there and quote <b>" + r.code + "</b>.</p>" +
      '<div class="row"><button class="btn" data-newreq>Return another medicine</button><button class="btn ghost" data-trackone>Track this request</button></div>';
    drawHistory();
    toast("Request " + r.code + " sent.");
    $("[data-newreq]").onclick = function () { current.submitReturnRequest(); $("#newReq").scrollIntoView({ behavior: "smooth" }); };
    $("[data-trackone]").onclick = function () { trackModal(r.requestId); };
  }

  /* ==================================================================== FACILITY STAFF */
  function staffFacility() { return Store.findFacility(current.facilityId); }
  function householdName(r) { var m = Store.findMedicine(r.medicineId), u = m && Store.findUser(m.userId); return u ? u.fullName : "—"; }
  function staffRows(rows, action) {
    if (!rows.length) return '<p class="muted">Nothing here right now.</p>';
    return '<div class="tablewrap"><table class="stack"><thead><tr><th>Request ID</th><th>Medicine</th><th>Household</th><th>Sent</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var m = Store.findMedicine(r.medicineId), g = Store.guidanceFor(m);
        var btn = r.requestStatus === "Pending" ? '<button class="btn small" data-review="' + r.requestId + '">Review</button>'
          : r.requestStatus === "Accepted" ? '<button class="btn small" data-receive="' + r.requestId + '">Confirm receipt</button>' : '<button class="btn small ghost" data-view="' + r.requestId + '">View</button>';
        return "<tr><td><b>" + r.code + "</b></td><td>" + esc(m.medicineName) + ' <span class="small muted">' + medLine(m) + "</span>" + (g && g.specialHandling ? '<br><span class="tag warnt">Special handling</span>' : "") + "</td><td>" + esc(householdName(r)) +
          '</td><td class="nowrap">' + fmtDate(r.requestedAt) + "</td><td>" + stamp(r.requestStatus) + "</td><td>" + (action === false ? "" : btn) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function bindStaffActions() {
    $all("[data-review]").forEach(function (b) { b.onclick = function () { reviewModal(Number(b.dataset.review)); }; });
    $all("[data-receive]").forEach(function (b) { b.onclick = function () { receiptModal(Number(b.dataset.receive)); }; });
    $all("[data-view]").forEach(function (b) { b.onclick = function () { reviewModal(Number(b.dataset.view), true); }; });
  }
  function viewStaffHome() {
    var f = staffFacility(), rows = Store.requestsFor(current);
    var by = function (s) { return rows.filter(function (r) { return r.requestStatus === s; }); };
    if (!f) { app.innerHTML = '<div class="wrap page">' + alertBox("warn", "Your account isn't linked to a collection point yet.", "Ask a MedDrop administrator to assign you to one.") + "</div>"; return; }
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>' + esc(f.facilityName) + "</h1><p>" + esc(f.area) + ", " + esc(f.city) + " · " + esc(f.hoursText()) + " · " + (f.status === "Active" ? (f.isOpenNow() ? "Open now" : "Closed now") : "Not accepting new requests") + "</p></div></div>" +
      '<div class="stats"><div class="stat amber"><b>' + by("Pending").length + '</b><span>Pending requests</span></div><div class="stat"><b>' + by("Accepted").length + '</b><span>Waiting for drop-off</span></div>' +
      '<div class="stat"><b>' + by("Completed").length + '</b><span>Received medicines</span></div><div class="stat"><b>' + by("Rejected").length + "</b><span>Declined</span></div></div>" +
      '<section class="card"><div class="row" style="justify-content:space-between"><h2>Requests for review</h2><a href="#staff-requests">All requests</a></div>' + staffRows(by("Pending")) + "</section>" +
      '<section class="card"><div class="row" style="justify-content:space-between"><h2>Waiting for drop-off</h2><a href="#staff-receipt">Confirm receipt</a></div>' + staffRows(by("Accepted")) + "</section></div>";
    bindStaffActions();
  }
  function viewStaffRequests() {
    var rows = Store.requestsFor(current), filt = state.staffFilter;
    var shown = filt === "All" ? rows : rows.filter(function (r) { return r.requestStatus === filt; });
    var tabs = ["Pending", "Accepted", "Completed", "Rejected", "All"];
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>Return requests</h1><p>Requests households have sent to ' + esc(staffFacility().facilityName) + ". Review each one and accept or decline it.</p></div></div>" +
      '<div class="tabs" role="tablist">' + tabs.map(function (t) {
        var n = t === "All" ? rows.length : rows.filter(function (r) { return r.requestStatus === t; }).length;
        return '<button role="tab" aria-selected="' + (t === filt) + '" data-f="' + t + '">' + (t === "Completed" ? "Received" : t === "Rejected" ? "Declined" : t) + " (" + n + ")</button>";
      }).join("") + '</div><section class="card">' + staffRows(shown) + "</section></div>";
    $all("[data-f]").forEach(function (b) { b.onclick = function () { state.staffFilter = b.dataset.f; render(); }; });
    bindStaffActions();
  }
  /* UC06 Review Return Request (FR-11) */
  function reviewModal(id, readOnly) {
    var r = Store.findRequest(id), m = Store.findMedicine(r.medicineId), g = Store.guidanceFor(m), f = Store.findFacility(r.facilityId);
    var accepts = f.acceptedCategories.indexOf(m.medicineCategory) !== -1;
    var box = openModal('<div class="row" style="justify-content:space-between"><h2 style="margin:0">Request ' + r.code + "</h2>" + stamp(r.requestStatus) + '</div><div id="rvErr" style="margin-top:12px"></div>' +
      '<div class="row" style="align-items:flex-start;gap:18px;margin-top:8px">' + (m.medicineImage ? '<img src="' + esc(m.medicineImage) + '" alt="" style="width:96px;height:96px;border-radius:12px;object-fit:cover">' : "") +
      '<dl class="kv" style="flex:1"><dt>Medicine</dt><dd>' + esc(m.medicineName) + "</dd><dt>Strength / form</dt><dd>" + esc(m.dosage) + " · " + esc(m.dosageForm) + "</dd><dt>Type</dt><dd>" + esc(categoryLabel(m.medicineCategory)) +
      "</dd><dt>Quantity</dt><dd>" + esc(m.quantity) + "</dd><dt>Expiry</dt><dd>" + fmtDate(m.expiryDate) + "</dd><dt>Household</dt><dd>" + esc(householdName(r)) + "</dd><dt>Sent</dt><dd>" + fmtDateTime(r.requestedAt) + "</dd>" +
      (r.rejectionReason ? "<dt>Decline reason</dt><dd>" + esc(r.rejectionReason) + "</dd>" : "") + "</dl></div>" +
      (g && g.specialHandling ? alertBox("warn", "Special handling", esc(g.warningMessage)) : "") +
      (!accepts ? alertBox("error", "Your collection point isn't listed as accepting this type.", "Decline the request or contact an administrator to update your accepted types.") : "") +
      (readOnly || r.requestStatus !== "Pending" ? '<div class="row end"><button class="btn" data-x>Close</button></div>' :
        '<div class="field" style="margin-top:8px"><label for="rvReason">Reason for declining <span class="muted small">(only needed if you decline)</span></label><textarea id="rvReason" rows="2" placeholder="e.g. We can\'t accept chemotherapy medicines at this point."></textarea></div>' +
        '<div class="row end" style="margin-top:12px"><button class="btn ghost" data-x>Cancel</button><button class="btn warn" data-reject>Decline</button><button class="btn" data-accept' + (accepts ? "" : " disabled") + ">Accept request</button></div>"), true);
    $all("[data-x]", box).forEach(function (b) { b.onclick = closeModal; });
    var act = function (decision) {
      var res = current.reviewReturnRequest(id, decision, $("#rvReason").value);
      if (!res.ok) { $("#rvErr").innerHTML = errorList(res.errors); $("#rvReason").classList.add("invalid"); $("#rvReason").focus(); return; }
      closeModal(); render();
      toast("Request " + r.code + (decision === "Accepted" ? " accepted. The household has been told to drop it off." : " declined."));
    };
    var a = $("[data-accept]", box), j = $("[data-reject]", box);
    if (a) a.onclick = function () { act("Accepted"); };
    if (j) j.onclick = function () { act("Rejected"); };
  }
  /* UC07 Confirm Medicine Receipt (FR-13) */
  function viewStaffReceipt() {
    var rows = Store.requestsFor(current).filter(function (r) { return r.requestStatus === "Accepted"; });
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>Confirm receipt</h1><p>When a household drops off a medicine, find their request and confirm you\'ve received it.</p></div></div>' +
      '<section class="card"><form id="findReq" class="row" style="align-items:flex-end" novalidate><div class="field" style="flex:1 1 220px"><label for="rid">Request ID</label><input id="rid" type="search" placeholder="e.g. R004" autofocus autocomplete="off" pattern="[Rr]?[0-9]+"></div><button class="btn" type="submit">Find request</button></form><div id="findMsg" style="margin-top:12px"></div></section>' +
      '<section class="card"><h2>Waiting for drop-off</h2>' + staffRows(rows) + "</section></div>";
    bindStaffActions();
    $("#findReq").onsubmit = function (e) {
      e.preventDefault();
      var v = $("#rid").value.trim().toUpperCase().replace(/^R/, "");
      var r = /^\d+$/.test(v) ? Store.findRequest(Number(v)) : null;
      var msg = $("#findMsg");
      if (!r || r.facilityId !== current.facilityId) { msg.innerHTML = alertBox("error", "No request with that ID was sent to your collection point.", "Check the ID with the household."); return; }
      if (r.requestStatus === "Accepted") { msg.innerHTML = ""; receiptModal(r.requestId); return; }
      if (r.requestStatus === "Pending") { msg.innerHTML = alertBox("warn", "Request " + r.code + " hasn't been reviewed yet.", "Review and accept it first."); return; }
      msg.innerHTML = alertBox("info", "Request " + r.code + " is already " + statusText(r.requestStatus).toLowerCase() + ".");
    };
  }
  function receiptModal(id) {
    var r = Store.findRequest(id), m = Store.findMedicine(r.medicineId), g = Store.guidanceFor(m);
    var box = openModal("<h2>Confirm receipt of " + r.code + '</h2><div id="rcErr"></div><dl class="kv"><dt>Medicine</dt><dd>' + esc(m.medicineName) + " · " + medLine(m) + "</dd><dt>Household</dt><dd>" + esc(householdName(r)) + "</dd><dt>Accepted</dt><dd>" + fmtDateTime(r.reviewedAt) + "</dd></dl>" +
      (g && g.specialHandling ? '<div style="margin-top:14px">' + alertBox("warn", "Special handling", esc(g.warningMessage)) + "</div>" : "") +
      '<label class="check" style="margin:16px 0"><input type="checkbox" id="rcOk"> <span>I\'ve checked the medicine handed over matches this request.</span></label>' +
      '<div class="row end"><button class="btn ghost" data-x>Cancel</button><button class="btn" data-ok>Confirm received</button></div>');
    $("[data-x]", box).onclick = closeModal;
    $("[data-ok]", box).onclick = function () {
      if (!$("#rcOk").checked) { $("#rcErr").innerHTML = errorList(["Tick the box to confirm the medicine matches the request."]); return; }
      var res = current.confirmReceipt(id);
      if (!res.ok) { $("#rcErr").innerHTML = errorList(res.errors); return; }
      closeModal(); render();
      toast(r.code + " marked as received. Thank you!");
    };
  }

  /* ==================================================================== ADMINISTRATOR */
  function viewAdminHome() {
    var t = Store.tables, reqs = t.requests;
    var count = function (rows, fn) { var n = 0; for (var i = 0; i < rows.length; i++) if (fn(rows[i])) n++; return n; };
    var activeF = count(t.facilities, function (f) { return f.status === "Active"; });
    var pending = count(reqs, function (r) { return r.requestStatus === "Pending"; });
    var completed = count(reqs, function (r) { return r.requestStatus === "Completed"; });
    var roleCount = { Household: 0, Staff: 0, Admin: 0 };
    t.users.forEach(function (u) { roleCount[u.role]++; });
    var max = Math.max(1, reqs.length);
    var bars = ["Pending", "Accepted", "Completed", "Rejected"].map(function (s) {
      var n = count(reqs, function (r) { return r.requestStatus === s; });
      return '<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><span>' + stamp(s) + "</span><b>" + n + '</b></div><div style="height:8px;background:var(--mint);border-radius:6px;margin-top:6px"><div style="height:8px;border-radius:6px;background:var(--green);width:' + (n / max * 100) + '%"></div></div></div>';
    }).join("");
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>Administrator dashboard</h1><p>Manage who uses MedDrop and where medicines can be returned.</p></div></div>' +
      '<div class="stats"><div class="stat"><b>' + t.users.length + '</b><span>Total users</span></div><div class="stat"><b>' + activeF + '</b><span>Active collection points</span></div>' +
      '<div class="stat amber"><b>' + pending + '</b><span>Requests waiting for review</span></div><div class="stat"><b>' + completed + "</b><span>Medicines returned</span></div></div>" +
      '<div class="cols"><section class="card"><h2>Management overview</h2><div class="tablewrap"><table class="stack"><thead><tr><th>Area</th><th>Records</th><th></th></tr></thead><tbody>' +
      '<tr><td><b>User accounts</b><br><span class="small muted">' + roleCount.Household + " households · " + roleCount.Staff + " staff · " + roleCount.Admin + ' admins</span></td><td class="num">' + t.users.length + '</td><td><a class="btn small" href="#admin-users">Manage</a></td></tr>' +
      '<tr><td><b>Collection points</b><br><span class="small muted">' + activeF + " active · " + (t.facilities.length - activeF) + ' inactive</span></td><td class="num">' + t.facilities.length + '</td><td><a class="btn small" href="#admin-facilities">Manage</a></td></tr>' +
      '<tr><td><b>Return records</b><br><span class="small muted">All requests across collection points</span></td><td class="num">' + reqs.length + '</td><td><a class="btn small" href="#admin-requests">View</a></td></tr>' +
      '</tbody></table></div></section><section class="card"><h2>Requests by status</h2>' + bars + "</section></div>" +
      photoReadingCard() +
      '<section class="card"><h3>Sample data</h3><p class="muted small">This prototype keeps its records in this browser. Restore the original sample accounts, medicines and requests at any time.</p><button class="btn ghost" id="resetData">Restore sample data</button></section></div>';
    bindPhotoReading();
    $("#resetData").onclick = function () {
      confirmBox("Restore sample data?", "All changes made in this browser – new accounts, medicines, requests and collection points – will be replaced by the original sample data.", "Restore", function () {
        Store.reset(); setSession(Store.findUserByEmail("admin@meddrop.ae")); render(); toast("Sample data restored.");
      }, true);
    };
  }

  /* Photo reading set-up for static hosting (no back end): the key is kept in this browser only */
  function photoReadingCard() {
    if (AIRecognitionAPI.hasRuntime()) {
      return '<section class="card"><h3>Photo reading</h3>' + alertBox("ok", "Photo reading is on.", "On this site it uses the built-in AI connection, so no key is needed.") + "</section>";
    }
    var key = AIRecognitionAPI.getKey();
    return '<section class="card" id="aiCard"><h3>Photo reading</h3>' +
      (key ? alertBox("ok", "Photo reading is on in this browser.", "Key ending in …" + esc(key.slice(-4)) + ". Households using this browser can add medicines from a photo.")
           : alertBox("info", "Photo reading is off in this browser.", "Paste an Anthropic API key to let households add medicines from a photo of the box.")) +
      '<div id="aiKeyErr"></div><form id="aiKeyForm" class="row" style="align-items:flex-end" novalidate><div class="field" style="flex:1 1 280px"><label for="aiKey">Anthropic API key</label>' +
      '<input id="aiKey" name="aiKey" type="password" autocomplete="off" placeholder="sk-ant-…" pattern="sk-ant-.+"></div><button class="btn" type="submit">' + (key ? "Replace key" : "Switch on") + "</button>" +
      (key ? '<button class="btn ghost" type="button" id="aiKeyOff">Switch off</button>' : "") + "</form>" +
      '<p class="small muted" style="margin-top:10px">The key is saved only in this browser and sent only to Anthropic when a photo is read. Use a key with a spending limit, and don\'t switch this on on a shared computer.</p></section>';
  }
  function bindPhotoReading() {
    var form = $("#aiKeyForm");
    if (!form) return;
    form.onsubmit = function (e) {
      e.preventDefault();
      var v = $("#aiKey").value.trim();
      if (!/^(sk-ant-\S{10,}|AIza[\w-]{30,}|AQ\.[\w.-]{20,})$/.test(v)) return showErrors(form, $("#aiKeyErr"), [{ field: "aiKey", msg: "That doesn't look like an AI API key. Claude keys start with sk-ant- and Gemini keys start with AIza or AQ." }]);
      if (!AIRecognitionAPI.setKey(v)) return showErrors(form, $("#aiKeyErr"), [{ msg: "This browser won't let MedDrop save the key (private browsing may block it)." }]);
      render(); toast("Photo reading is on in this browser.");
    };
    var off = $("#aiKeyOff");
    if (off) off.onclick = function () { AIRecognitionAPI.setKey(""); render(); toast("Photo reading switched off."); };
  }

  /* UC08 Manage User Accounts (FR-14) */
  function facilityOptions(sel) {
    return '<option value="">Choose a collection point…</option>' + Store.tables.facilities.map(function (f) { return '<option value="' + f.facilityId + '"' + (f.facilityId === Number(sel) ? " selected" : "") + ">" + esc(f.facilityName) + (f.status !== "Active" ? " (inactive)" : "") + "</option>"; }).join("");
  }
  function viewAdminUsers() {
    var q = state.userQuery.toLowerCase(), rf = state.userRole || "";
    var rows = Store.tables.users.filter(function (u) { return (!q || (u.fullName + " " + u.email).toLowerCase().indexOf(q) !== -1) && (!rf || u.role === rf); });
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>User accounts</h1><p>Change a person\'s role, link staff to their collection point, or suspend an account.</p></div><button class="btn" id="addUser">Add staff or admin account</button></div>' +
      '<section class="card"><div class="row" style="margin-bottom:14px;align-items:flex-end"><div class="field" style="flex:1 1 240px"><label for="uq">Search</label><input id="uq" type="search" placeholder="Name or email" value="' + esc(state.userQuery) + '"></div>' +
      '<div class="field" style="flex:0 1 220px"><label for="ur">Role</label><select id="ur"><option value="">All roles</option><option value="Household"' + (rf === "Household" ? " selected" : "") + '>Household</option><option value="Staff"' + (rf === "Staff" ? " selected" : "") + '>Facility staff</option><option value="Admin"' + (rf === "Admin" ? " selected" : "") + ">Administrator</option></select></div></div>" +
      (rows.length ? '<div class="tablewrap"><table class="stack"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Collection point</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>' +
        rows.map(function (u) {
          var f = u.facilityId ? Store.findFacility(u.facilityId) : null;
          return "<tr><td><b>" + esc(u.fullName) + "</b>" + (u.userId === current.userId ? ' <span class="tag">You</span>' : "") + "</td><td>" + esc(u.email) + "</td><td>" + PORTAL[u.role] + "</td><td>" + (f ? esc(f.facilityName) : "") + "</td><td>" + stamp(u.accountStatus) + '</td><td class="nowrap">' + fmtDate(u.createdAt) + '</td><td><button class="btn small ghost" data-edit="' + u.userId + '">Edit</button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<p class="muted">No accounts match your search.</p>') + "</section></div>";
    var uq = $("#uq");
    uq.oninput = function () { state.userQuery = uq.value; var pos = uq.selectionStart; render(); var n = $("#uq"); n.focus(); n.setSelectionRange(pos, pos); };
    $("#ur").onchange = function () { state.userRole = this.value; render(); };
    $all("[data-edit]").forEach(function (b) { b.onclick = function () { userModal(Number(b.dataset.edit)); }; });
    $("#addUser").onclick = function () { userModal(null); };
  }
  function userModal(id) {
    var u = id ? Store.findUser(id) : null;
    var role = u ? u.role : "Staff";
    var box = openModal("<h2>" + (u ? "Edit " + esc(u.fullName) : "Add staff or admin account") + '</h2><div id="umErr"></div><form id="umForm" novalidate><div class="grid2">' +
      (u ? '<p class="full muted" style="grid-column:1/-1;margin:0">' + esc(u.email) + "</p>" :
        '<div class="field full"><label class="req" for="umName">Full name</label><input id="umName" name="fullName" required></div><div class="field"><label class="req" for="umEmail">Email</label><input id="umEmail" name="email" type="email" required></div>' +
        '<div class="field"><label class="req" for="umPw">Temporary password</label><input id="umPw" name="password" type="text" required minlength="8" value="' + DEMO_PASSWORD + '"></div>') +
      '<div class="field"><label class="req" for="umRole">Role</label><select id="umRole" name="role">' + (u ? '<option value="Household"' + (role === "Household" ? " selected" : "") + ">Household</option>" : "") +
      '<option value="Staff"' + (role === "Staff" ? " selected" : "") + '>Facility staff</option><option value="Admin"' + (role === "Admin" ? " selected" : "") + ">Administrator</option></select></div>" +
      '<div class="field" id="umFacWrap"><label class="req" for="umFac">Collection point</label><select id="umFac" name="facilityId">' + facilityOptions(u ? u.facilityId : "") + "</select></div>" +
      (u ? '<fieldset class="field full"><legend>Account status</legend><div class="row"><label class="check"><input type="radio" name="accountStatus" value="Active"' + (u.accountStatus === "Active" ? " checked" : "") + '> Active</label><label class="check"><input type="radio" name="accountStatus" value="Suspended"' + (u.accountStatus === "Suspended" ? " checked" : "") + "> Suspended – can't sign in</label></div></fieldset>" : "") +
      '</div><div class="row end" style="margin-top:16px"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn" type="submit">Save changes</button></div></form>', true);
    var syncFac = function () { $("#umFacWrap").classList.toggle("hidden", $("#umRole").value !== "Staff"); };
    $("#umRole").onchange = syncFac; syncFac();
    $("[data-x]", box).onclick = closeModal;
    $("#umForm").onsubmit = function (e) {
      e.preventDefault();
      var d = formData(this), errs = [];
      var changes = { role: d.role, facilityId: d.role === "Staff" ? Number(d.facilityId) || null : null };
      if (d.role === "Staff" && !changes.facilityId) errs.push({ field: "facilityId", msg: "Choose the collection point this staff member works at." });
      if (!u) {
        if (d.fullName.trim().length < 3) errs.push({ field: "fullName", msg: "Enter the person's full name." });
        if (!/^\S+@\S+\.\S+$/.test(d.email)) errs.push({ field: "email", msg: "Enter a valid email address." });
        else if (Store.findUserByEmail(d.email)) errs.push({ field: "email", msg: "An account with this email already exists." });
        if (d.password.length < 8) errs.push({ field: "password", msg: "The temporary password needs at least 8 characters." });
      }
      if (errs.length) return showErrors(this, $("#umErr"), errs);
      if (!u) {
        Store.tables.users.push(Store.makeUser({ userId: Store.nextId("users"), fullName: d.fullName.trim(), email: d.email.trim(), passwordHash: hashPassword(d.password), role: d.role, facilityId: changes.facilityId }));
        Store.save(); closeModal(); render(); toast("Account created for " + d.fullName.trim() + "."); return;
      }
      changes.accountStatus = d.accountStatus;
      var res = current.manageUsers(u.userId, changes);
      if (!res.ok) return showErrors(this, $("#umErr"), res.errors);
      closeModal(); render(); toast("Changes saved for " + u.fullName + ".");
    };
  }

  /* UC09 Manage Collection Facilities (FR-15) */
  function viewAdminFacilities() {
    var rows = Store.tables.facilities;
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>Collection points</h1><p>Add new collection points, keep their details up to date, or stop them taking new requests.</p></div><button class="btn" id="addFac">Add collection point</button></div>' +
      '<section class="card"><div class="tablewrap"><table class="stack"><thead><tr><th>Name</th><th>Location</th><th>Hours</th><th>Accepts</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map(function (f) {
        return "<tr><td><b>" + esc(f.facilityName) + '</b><br><span class="small muted">' + esc(f.contactNumber) + "</span></td><td>" + esc(f.area) + ", " + esc(f.city) + '</td><td class="small">' + esc(f.hoursText()) + '</td><td class="small">' + f.acceptedCategories.length + " of " + (CATEGORIES.length - 1) + " types</td><td>" + stamp(f.status) +
          '</td><td><div class="row"><button class="btn small ghost" data-fedit="' + f.facilityId + '">Edit</button><button class="btn small ' + (f.status === "Active" ? "warn" : "") + '" data-ftoggle="' + f.facilityId + '">' + (f.status === "Active" ? "Deactivate" : "Reactivate") + "</button></div></td></tr>";
      }).join("") + "</tbody></table></div></section></div>";
    $("#addFac").onclick = function () { facilityModal(null); };
    $all("[data-fedit]").forEach(function (b) { b.onclick = function () { facilityModal(Number(b.dataset.fedit)); }; });
    $all("[data-ftoggle]").forEach(function (b) {
      b.onclick = function () {
        var f = Store.findFacility(Number(b.dataset.ftoggle));
        var open = Store.tables.requests.filter(function (r) { return r.facilityId === f.facilityId && (r.requestStatus === "Pending" || r.requestStatus === "Accepted"); }).length;
        if (f.status === "Active") {
          confirmBox("Deactivate " + esc(f.facilityName) + "?", "It will no longer appear in searches and can't receive new requests." + (open ? " It still has <b>" + open + " open request" + (open === 1 ? "" : "s") + "</b>, which staff can finish." : ""), "Deactivate", function () {
            current.manageFacilities("deactivate", { facilityId: f.facilityId }); render(); toast(f.facilityName + " deactivated.");
          }, true);
        } else { current.manageFacilities("activate", { facilityId: f.facilityId }); render(); toast(f.facilityName + " is active again."); }
      };
    });
  }
  function facilityModal(id) {
    var f = id ? Store.findFacility(id) : new CollectionFacility({ openDays: [0, 1, 2, 3, 4, 5, 6], opens: "09:00", closes: "21:00", acceptedCategories: GENERAL });
    var cities = ["Abu Dhabi", "Dubai", "Sharjah", "Al Ain", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var box = openModal("<h2>" + (id ? "Edit collection point" : "Add a collection point") + '</h2><div id="fmErr"></div><form id="fmForm" novalidate><div class="grid2">' +
      '<div class="field full"><label class="req" for="fmName">Name</label><input id="fmName" name="facilityName" required value="' + esc(f.facilityName) + '"></div>' +
      '<div class="field full"><label class="req" for="fmAddr">Street address</label><input id="fmAddr" name="address" required value="' + esc(f.address) + '"></div>' +
      '<div class="field"><label class="req" for="fmArea">Area</label><input id="fmArea" name="area" required value="' + esc(f.area) + '" placeholder="e.g. Al Barsha"></div>' +
      '<div class="field"><label class="req" for="fmCity">City</label><select id="fmCity" name="city"><option value="">Choose…</option>' + cities.map(function (c) { return "<option" + (c === f.city ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="fmTel">Phone</label><input id="fmTel" name="contactNumber" type="tel" value="' + esc(f.contactNumber) + '" placeholder="+971 4 000 0000"></div><div></div>' +
      '<fieldset class="field full"><legend class="req">Open on</legend><div class="days">' + days.map(function (d, i) { return '<label class="check"><input type="checkbox" name="openDays" value="' + i + '"' + (f.openDays.indexOf(i) !== -1 ? " checked" : "") + "> " + d + "</label>"; }).join("") + "</div></fieldset>" +
      '<div class="field"><label class="req" for="fmOpen">Opens</label><input id="fmOpen" name="opens" type="time" value="' + esc(f.opens) + '"></div><div class="field"><label class="req" for="fmClose">Closes</label><input id="fmClose" name="closes" type="time" value="' + esc(f.closes) + '"></div>' +
      '<fieldset class="field full"><legend class="req">Accepts</legend><div class="checks">' + CATEGORIES.filter(function (c) { return c.key !== "other"; }).map(function (c) { return '<label class="check"><input type="checkbox" name="acceptedCategories" value="' + c.key + '"' + (f.acceptedCategories.indexOf(c.key) !== -1 ? " checked" : "") + "> " + esc(c.label) + "</label>"; }).join("") + "</div></fieldset>" +
      '</div><div class="row end" style="margin-top:16px"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn" type="submit">' + (id ? "Save changes" : "Add collection point") + "</button></div></form>", true);
    $("[data-x]", box).onclick = closeModal;
    $("#fmForm").onsubmit = function (e) {
      e.preventDefault();
      var d = formData(this);
      d.openDays = d.openDays.map(Number);
      var pt = AREA_POINTS[d.area.trim().toLowerCase()] || AREA_POINTS[String(d.city).toLowerCase()] || {};
      d.facilityId = id; d.lat = id ? f.lat : pt.lat; d.lng = id ? f.lng : pt.lng;
      var res = current.manageFacilities(id ? "edit" : "add", d);
      if (!res.ok) return showErrors(this, $("#fmErr"), res.errors);
      closeModal(); render(); toast(res.facility.facilityName + (id ? " updated." : " added."));
    };
  }

  /* FR-16 Return Request Record Management */
  function viewAdminRequests() {
    var rows = Store.requestsFor(current), filt = state.adminReqFilter, q = (state.adminReqQ || "").toLowerCase();
    var shown = rows.filter(function (r) {
      if (filt !== "All" && r.requestStatus !== filt) return false;
      if (!q) return true;
      var m = Store.findMedicine(r.medicineId), f = Store.findFacility(r.facilityId);
      return (r.code + " " + m.medicineName + " " + f.facilityName + " " + householdName(r)).toLowerCase().indexOf(q) !== -1;
    });
    app.innerHTML = '<div class="wrap page"><div class="pagehead"><div><h1>Return records</h1><p>Every return request, with the medicine, collection point and what happened to it.</p></div></div>' +
      '<section class="card"><div class="row" style="margin-bottom:14px;align-items:flex-end"><div class="field" style="flex:1 1 240px"><label for="arq">Search</label><input id="arq" type="search" placeholder="Request ID, medicine, point or household" value="' + esc(state.adminReqQ || "") + '"></div>' +
      '<div class="field" style="flex:0 1 220px"><label for="arf">Status</label><select id="arf">' + ["All", "Pending", "Accepted", "Completed", "Rejected"].map(function (s) { return "<option value=\"" + s + "\"" + (s === filt ? " selected" : "") + ">" + (s === "All" ? "All statuses" : statusText(s)) + "</option>"; }).join("") + "</select></div></div>" +
      (shown.length ? '<div class="tablewrap"><table class="stack"><thead><tr><th>ID</th><th>Medicine</th><th>Household</th><th>Collection point</th><th>Status</th><th>Sent</th><th>Reviewed by</th><th>Received</th></tr></thead><tbody>' +
        shown.map(function (r) {
          var m = Store.findMedicine(r.medicineId), f = Store.findFacility(r.facilityId), rv = r.reviewedBy ? Store.findUser(r.reviewedBy) : null;
          return "<tr><td><b>" + r.code + "</b></td><td>" + esc(m.medicineName) + "</td><td>" + esc(householdName(r)) + "</td><td>" + esc(f.facilityName) + "</td><td>" + stamp(r.requestStatus) + '</td><td class="nowrap">' + fmtDate(r.requestedAt) + "</td><td>" + (rv ? esc(rv.fullName) : "") + '</td><td class="nowrap">' + (r.receivedAt ? fmtDate(r.receivedAt) : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="muted">No records match.</p>') + "</section></div>";
    var inp = $("#arq");
    inp.oninput = function () { state.adminReqQ = inp.value; var p = inp.selectionStart; render(); var n = $("#arq"); n.focus(); n.setSelectionRange(p, p); };
    $("#arf").onchange = function () { state.adminReqFilter = this.value; render(); };
  }

  render();
}
