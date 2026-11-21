/* ==========================================================================
   MedDrop – AI Recognition API (external actor in the Context Diagram and SD UC-01)
   householdUser1 → AI Recognition API : recognizeMedicine(photo) → identifiedDetails

   photo = { file: File|null, sample: {result}|null, thumb: dataURL }
   Where a real photo is sent, in this order:
     1. Published on claude.ai: Claude is reached through the page's built-in AI connection.
     2. Static hosting (no back end, e.g. GitHub Pages): straight from the browser to the
        Claude API, with a key an administrator saved in THIS browser (Admin dashboard →
        Photo reading). The key is never written into the code.
     3. Served by the Java back end (server/MedDropServer.java): POST /api/recognize.
        The server adds the secret API key and calls the Claude vision API.
     4. Nothing available: the user types the details while looking at the photo.
   Sample photos are answered locally (a stand-in for the API, used for demos).
   ========================================================================== */

var AIRecognitionAPI = {
  service: null,

  /* Connects to the vision AI. A failed connection is not remembered, so the next photo tries again. */
  connect: function () {
    var self = this;
    if (this.service) return Promise.resolve(this.service);
    if (!(window.claude && typeof window.claude.use === "function")) {
      console.warn("MedDrop: no AI runtime – this copy of the page is not running on claude.ai.");
      return Promise.resolve(null);
    }
    return window.claude.use("sample").then(function (ai) {
      if (!ai) console.warn("MedDrop: the AI capability was not provided to this view.");
      self.service = ai || null;
      return self.service;
    }).catch(function (e) { console.warn("MedDrop: AI connection failed", e); return null; });
  },

  /* recognizeMedicine(photo) → identifiedDetails, or throws { code: "unrecognized" | "unavailable" | "rate_limited" } */
  recognizeMedicine: function (photo) {
    var self = this;
    if (photo.sample) {
      return new Promise(function (resolve) { setTimeout(resolve, 1400); })
        .then(function () { return self.toIdentifiedDetails(photo.sample.result); });
    }
    if (!window.claude && this.getKey()) return this.viaBrowserKey(photo);
    if (/^https?:$/.test(location.protocol) && !window.claude) return this.viaBackend(photo);
    var ai;
    return this.connect().then(function (service) {
      ai = service;
      if (!ai) throw { code: window.claude ? "unavailable" : "offline_copy" };
      return typeof ai.limits === "function" ? ai.limits() : { images: true };
    }).then(function (limits) {
      if (!limits || !limits.images) throw { code: "no_images" };
      return self.shrink(photo.file);
    }).then(function (blob) {
      return ai.json(self.prompt(), { images: [blob], modelTier: "default" });
    }).then(function (res) { return self.toIdentifiedDetails(res); });
  },

  /* ---- browser key (static hosting without a back end) ---- */
  KEY_NAME: "meddrop.aiKey",
  MODEL: "claude-sonnet-5-5",
  getKey: function () { try { return localStorage.getItem(this.KEY_NAME) || ""; } catch (e) { return ""; } },
  setKey: function (key) { try { if (key) localStorage.setItem(this.KEY_NAME, key); else localStorage.removeItem(this.KEY_NAME); return true; } catch (e) { return false; } },
  hasRuntime: function () { return !!(window.claude && typeof window.claude.use === "function"); },

  /* Which AI service a saved key belongs to: Google Gemini keys start with "AIza" */
  provider: function (key) { return /^AIza/.test(key || this.getKey()) ? "gemini" : "anthropic"; },
  GEMINI_MODELS: ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash"],

  /* Google Gemini API, straight from the browser (key saved by the administrator) */
  viaGemini: function (photo) {
    var self = this, key = this.getKey();
    return this.shrink(photo.file).then(function (blob) { return self.toBase64(blob); }).then(function (b64) {
      var body = JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: b64 } }, { text: self.prompt() }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 }
      });
      /* model names change over time, so try each until one answers */
      function attempt(i) {
        if (i >= self.GEMINI_MODELS.length) throw { code: "unavailable" };
        return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + self.GEMINI_MODELS[i] + ":generateContent", {
          method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: body
        }).catch(function () { throw { code: "unavailable" }; }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            var reason = JSON.stringify(data.error || "");
            if (res.status === 404) return attempt(i + 1);
            if (res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(reason)) throw { code: "bad_key" };
            if (res.status === 429) throw { code: "rate_limited" };
            if (!res.ok) { console.warn("MedDrop: Gemini error", res.status, data); return attempt(i + 1); }
            var parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
            var text = parts.map(function (p) { return p.text || ""; }).join("");
            return self.fromMessage({ content: [{ type: "text", text: text }] });
          });
        });
      }
      return attempt(0);
    });
  },

   
  viaBrowserKey: function (photo) {
         if (this.provider() === "gemini") return this.viaGemini(photo);
    var self = this, key = this.getKey();
    return this.shrink(photo.file).then(function (blob) { return self.toBase64(blob); }).then(function (b64) {
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"   /* allows a call straight from the browser */
        },
        body: JSON.stringify({
          model: self.MODEL, max_tokens: 400,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text", text: self.prompt() }
          ] }]
        })
      });
    }).catch(function () { throw { code: "unavailable" }; }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.status === 401 || res.status === 403) throw { code: "bad_key" };
        if (res.status === 429) throw { code: "rate_limited" };
        if (!res.ok) { console.warn("MedDrop: AI API error", res.status, body); throw { code: "unavailable" }; }
        return self.fromMessage(body);
      });
    });
  },

  /* The Messages API answers { content: [ { type: "text", text: "{...json...}" } ] } */
  fromMessage: function (body) {
    var text = (body.content || []).filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("");
    var start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw { code: "unrecognized" };
    var parsed;
    try { parsed = JSON.parse(text.slice(start, end + 1)); } catch (e) { throw { code: "unrecognized" }; }
    return this.toIdentifiedDetails(parsed);
  },

  /* Java back end: POST /api/recognize { mediaType, data } → the AI API's answer */
  viaBackend: function (photo) {
    var self = this;
    return this.shrink(photo.file).then(function (blob) { return self.toBase64(blob); }).then(function (b64) {
      return fetch("api/recognize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaType: "image/jpeg", data: b64 }) });
    }).catch(function () { throw { code: "unavailable" }; }).then(function (res) {
      if (res.status === 404 || res.status === 405 || res.status === 501) throw { code: "offline_copy" };   /* a plain web server, not MedDrop's */
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          switch (body.error) {
            case "no_key": throw { code: "no_key" };
            case "rate_limited": throw { code: "rate_limited" };
            default: throw { code: "unavailable" };
          }
        }
        return self.fromMessage(body);
      });
    });
  },

  toBase64: function (blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  },

  prompt: function () {
    return "You read photos of medicine packaging for a medicine-return app. Look at the image and reply with ONLY a JSON object with these keys:\n" +
      '{"recognized": boolean (false if this is not a readable medicine package),\n "medicineName": string (active ingredient or name as printed),\n "dosage": string (strength, e.g. "500 mg" or "250 mg/5 ml"; "" if unreadable),\n' +
      ' "dosageForm": one of ' + JSON.stringify(DOSAGE_FORMS) + ' or "",\n "medicineCategory": one of ' + JSON.stringify(CATEGORIES.map(function (c) { return c.key; })) +
      ' (insulin/needles = injectables; opioids, benzodiazepines = controlled; chemotherapy = hazardous),\n' +
      ' "quantity": integer number of packs visible (default 1),\n "expiryDate": "YYYY-MM-DD" (if only month/year is printed use the last day of that month; "" if not visible)}\nDo not guess values you cannot read; use "" instead.';
  },

  /* Cleans the API answer: anything not in our lists is left blank for the user to fill in (FR-05) */
  toIdentifiedDetails: function (res) {
    if (!res || !res.recognized || !res.medicineName) throw { code: "unrecognized" };
    var keys = CATEGORIES.map(function (c) { return c.key; });
    return {
      medicineName: String(res.medicineName || ""),
      dosage: String(res.dosage || ""),
      dosageForm: DOSAGE_FORMS.indexOf(res.dosageForm) !== -1 ? res.dosageForm : "",
      medicineCategory: keys.indexOf(res.medicineCategory) !== -1 ? res.medicineCategory : "",
      quantity: Number(res.quantity) > 0 ? Math.round(res.quantity) : 1,
      expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(res.expiryDate || "") ? res.expiryDate : ""
    };
  },

  /* Large phone photos are scaled down before sending */
  shrink: function (file) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1280 / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve(b || file); }, "image/jpeg", .85);
      };
      img.onerror = function () { resolve(file); };
      img.src = URL.createObjectURL(file);
    });
  }
};
