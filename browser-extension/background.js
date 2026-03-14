const CONTEXT_KEY = "gov_autofill_context";
const PENDING_KEY = "gov_autofill_pending";
const LAST_RESULT_KEY = "gov_autofill_last_result";
const AUTH_SNAPSHOT_KEY = "gov_auth_snapshot";

const APP_STORAGE_CONTEXT_KEY = "gov_platform_extension_payload";
const APP_STORAGE_TOKEN_KEY = "gov_platform_token";
const APP_STORAGE_USER_KEY = "gov_platform_user";
const APP_STORAGE_PROFILE_KEY = "gov_platform_profile";

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const CONTEXT_SOURCE = "gov-scheme-platform";
const CONTEXT_TYPE = "SCHEME_AUTOFILL_CONTEXT";

const OFFICIAL_SUFFIXES = [".gov.in", ".nic.in", ".gov", ".ac.in"];
const OFFICIAL_HOSTS = new Set(["maandhan.in", "www.maandhan.in", "localhost", "127.0.0.1"]);

const APP_TAB_PATTERNS = [
  "http://localhost/*",
  "https://localhost/*",
  "http://127.0.0.1/*",
  "https://127.0.0.1/*",
];

const DEFAULT_API_BASES = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173/api",
  "http://127.0.0.1:5173/api",
];

const NORTH_EAST_STATES = new Set([
  "arunachal pradesh",
  "assam",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "sikkim",
  "tripura",
]);

const normalizeToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const PROFILE_KEY_ALIASES = {
  dob: "date_of_birth",
  birth_date: "date_of_birth",
  applicant_name: "name",
  full_name: "name",
  aadhaar: "aadhaar_number",
  aadhar: "aadhaar_number",
  uid: "aadhaar_number",
  pan: "pan_number",
  annual_income: "income",
  family_income: "income",
  household_income: "income",
  account_number: "bank_account",
  ifsc: "ifsc_code",
  mobile: "phone",
  mobile_number: "phone",
  contact_number: "phone",
  email_id: "email",
  mail_id: "email",
  pin_code: "pincode",
  postal_code: "pincode",
  zip_code: "pincode",
  father_s_name: "father_name",
  spouse_name: "husband_name",
  husband_s_name: "husband_name",
  care_of: "guardian_name",
  c_o: "guardian_name",
  location_city: "city",
  location_district: "district",
  location_state: "state",
  location_pincode: "pincode",
  location_pin_code: "pincode",
};

const canonicalizeProfileKey = (value) => {
  const key = normalizeToken(value);
  if (!key) return "";
  return PROFILE_KEY_ALIASES[key] || key;
};

const buildProfileSignature = (profile = {}) => {
  const state = normalizeText(profile?.state || profile?.location?.state || "");
  const annualIncomeRaw = profile?.annual_income ?? profile?.income ?? "";
  const annualIncome = Number(annualIncomeRaw);
  return [
    `age:${normalizeText(profile?.age ?? "")}`,
    `occupation:${normalizeText(profile?.occupation || "")}`,
    `category:${normalizeText(profile?.category || "")}`,
    `income:${Number.isFinite(annualIncome) ? String(annualIncome) : ""}`,
    `gender:${normalizeText(profile?.gender || "")}`,
    `state:${state}`,
  ].join("|");
};

const withRecommendationMeta = (envelope = {}, recommendationMeta = {}) => {
  const payload = envelope?.payload && typeof envelope.payload === "object" ? envelope.payload : {};
  const existingMeta =
    payload?.recommendation_meta && typeof payload.recommendation_meta === "object"
      ? payload.recommendation_meta
      : {};

  return {
    ...(envelope && typeof envelope === "object" ? envelope : {}),
    payload: {
      ...payload,
      recommendation_meta: {
        ...existingMeta,
        ...(recommendationMeta && typeof recommendationMeta === "object" ? recommendationMeta : {}),
      },
    },
  };
};

const canonicalMessageType = (message = {}) => {
  const raw = message?.type || message?.action || message?.message_type || "";
  const type = normalizeToken(raw);
  const aliases = {
    store_context: "store_autofill_context",
    save_context: "store_autofill_context",
    get_context: "get_autofill_context",
    get_context_from_app: "sync_context_from_app",
    sync_context: "sync_context_from_app",
    autofill: "autofill_active_tab",
    fill_current_page: "autofill_active_tab",
    get_last_result: "get_last_autofill_result",
    store_last_result: "store_last_autofill_result",
    clear_context: "clear_autofill_context",
    download_file: "download_file_from_url",
    build_plan: "build_autofill_plan",
    generate_plan: "build_autofill_plan",
    generate_steps: "build_autofill_plan",
  };
  return aliases[type] || type;
};

const safeJsonParse = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const uniqueStrings = (items = []) =>
  Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));

const trimSlashes = (value) => String(value || "").replace(/\/+$/, "");

const withLeadingSlash = (value) => {
  const text = String(value || "").trim();
  if (!text) return "/";
  return text.startsWith("/") ? text : `/${text}`;
};

const isOfficialHost = (url) => {
  try {
    const parsed = new URL(String(url || ""));
    const host = parsed.hostname.toLowerCase();
    if (OFFICIAL_HOSTS.has(host)) return true;
    return OFFICIAL_SUFFIXES.some(
      (suffix) => host === suffix.slice(1).toLowerCase() || host.endsWith(suffix.toLowerCase())
    );
  } catch {
    return false;
  }
};

const toIso = (value) => {
  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
};

const setStorage = (values) =>
  new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });

const getStorage = (keys) =>
  new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });

const sendMessageToTab = (tabId, message) =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }
      resolve(response || { ok: false, error: "No response from content script" });
    });
  });

const runAutofillOnTab = async (tabId, envelope) => {
  if (!tabId) {
    return {
      ok: false,
      error: "Missing tab id",
    };
  }
  return sendMessageToTab(tabId, {
    type: "RUN_AUTOFILL_FROM_CONTEXT",
    envelope,
  });
};

const executeScriptReadContext = (tabId) =>
  new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: (contextKey) => {
          try {
            const raw = window.localStorage.getItem(contextKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
          } catch {
            return null;
          }
        },
        args: [APP_STORAGE_CONTEXT_KEY],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(results?.[0]?.result || null);
      }
    );
  });

const executeScriptReadAuthSnapshot = (tabId) =>
  new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: (tokenKey, userKey, profileKey) => {
          const parseJson = (value) => {
            if (!value) return null;
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          };
          return {
            token: String(window.localStorage.getItem(tokenKey) || "").trim(),
            user: parseJson(window.localStorage.getItem(userKey)),
            profile: parseJson(window.localStorage.getItem(profileKey)),
            app_origin: String(window.location.origin || "").trim(),
          };
        },
        args: [APP_STORAGE_TOKEN_KEY, APP_STORAGE_USER_KEY, APP_STORAGE_PROFILE_KEY],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(results?.[0]?.result || null);
      }
    );
  });

const sanitizeAuthSnapshot = (raw) => {
  const token = String(raw?.token || "").trim();
  const user = safeJsonParse(raw?.user, raw?.user || null);
  const profile = safeJsonParse(raw?.profile, raw?.profile || null);
  const appOrigin = String(raw?.app_origin || "").trim();
  if (!token) return null;
  return {
    token,
    user: user && typeof user === "object" ? user : null,
    profile: profile && typeof profile === "object" ? profile : null,
    app_origin: appOrigin,
    captured_at: toIso(new Date()),
  };
};

const tryReadContextFromTab = async (tabId) => {
  const messageResult = await sendMessageToTab(tabId, {
    type: "GET_CONTEXT_FROM_PAGE",
  });
  if (messageResult?.ok && messageResult?.envelope) {
    return messageResult.envelope;
  }

  const injected = await executeScriptReadContext(tabId);
  if (!injected || typeof injected !== "object") return null;
  const source = normalizeText(injected?.source);
  const type = normalizeText(injected?.type);
  if (source !== normalizeText(CONTEXT_SOURCE) || type !== normalizeText(CONTEXT_TYPE)) return null;
  return injected;
};

const tryReadAuthSnapshotFromTab = async (tab) => {
  if (!tab?.id) return null;
  const rawSnapshot = await executeScriptReadAuthSnapshot(tab.id);
  const sanitized = sanitizeAuthSnapshot(rawSnapshot);
  if (!sanitized) return null;
  if (!sanitized.app_origin && tab?.url) {
    try {
      sanitized.app_origin = new URL(tab.url).origin;
    } catch {
      // ignore
    }
  }
  return sanitized;
};

const fetchAuthSnapshotFromAppTabs = async () => {
  for (const pattern of APP_TAB_PATTERNS) {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      const snapshot = await tryReadAuthSnapshotFromTab(tab);
      if (!snapshot) continue;
      await setStorage({
        [AUTH_SNAPSHOT_KEY]: snapshot,
      });
      return snapshot;
    }
  }
  return null;
};

const getAuthSnapshot = async () => {
  const state = await getStorage([AUTH_SNAPSHOT_KEY]);
  let snapshot = state[AUTH_SNAPSHOT_KEY] || null;
  if (snapshot?.token) return snapshot;
  snapshot = await fetchAuthSnapshotFromAppTabs();
  return snapshot;
};

const fetchContextFromAppTabs = async ({ markPending = true } = {}) => {
  for (const pattern of APP_TAB_PATTERNS) {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (!tab?.id) continue;

      const envelope = await tryReadContextFromTab(tab.id);
      const snapshot = await tryReadAuthSnapshotFromTab(tab);

      if (snapshot) {
        await setStorage({
          [AUTH_SNAPSHOT_KEY]: snapshot,
        });
      }

      if (!envelope) continue;
      const signatureSource =
        snapshot?.profile ||
        envelope?.payload?.profile_data ||
        envelope?.payload?.user_profile ||
        {};
      const enrichedEnvelope = withRecommendationMeta(envelope, {
        source:
          envelope?.payload?.recommendation_meta?.source || envelope?.payload?.context_origin || "app_context",
        profile_signature:
          envelope?.payload?.recommendation_meta?.profile_signature ||
          buildProfileSignature(signatureSource),
      });
      await setStorage({
        [CONTEXT_KEY]: enrichedEnvelope,
        [PENDING_KEY]: Boolean(markPending),
      });
      return enrichedEnvelope;
    }
  }
  return null;
};

const inferFileName = (url, mimeType = "") => {
  try {
    const parsed = new URL(url);
    const fromPath = parsed.pathname.split("/").pop();
    if (fromPath) return fromPath;
  } catch {
    // ignore
  }

  const extByMime = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const ext = extByMime[normalizeText(mimeType)] || "bin";
  return `document.${ext}`;
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const downloadFileAsBase64 = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`File download failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }
  if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${arrayBuffer.byteLength} bytes`);
  }

  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  return {
    base64: arrayBufferToBase64(arrayBuffer),
    mime_type: mimeType,
    file_name: inferFileName(url, mimeType),
    size_bytes: arrayBuffer.byteLength,
  };
};

const toDocumentList = (documents = []) =>
  (Array.isArray(documents) ? documents : [])
    .map((doc) => ({
      document_name: String(doc?.document_name || "").trim(),
      cloudinary_url: String(doc?.cloudinary_url || "").trim(),
      extracted_data:
        doc?.extracted_data && typeof doc.extracted_data === "object" ? doc.extracted_data : {},
      autofill_fields:
        doc?.autofill_fields && typeof doc.autofill_fields === "object" ? doc.autofill_fields : {},
      dynamic_schema:
        doc?.dynamic_schema && typeof doc.dynamic_schema === "object" ? doc.dynamic_schema : {},
    }))
    .filter((doc) => doc.document_name && doc.cloudinary_url);

const mapProfileFromSnapshot = (snapshot = {}) => {
  const user = snapshot?.user && typeof snapshot.user === "object" ? snapshot.user : {};
  const profile = snapshot?.profile && typeof snapshot.profile === "object" ? snapshot.profile : {};
  const location = profile?.location && typeof profile.location === "object" ? profile.location : {};
  return {
    name: String(user?.name || profile?.name || "").trim(),
    date_of_birth: String(profile?.date_of_birth || profile?.dob || "").trim(),
    age: String(profile?.age ?? "").trim(),
    gender: String(profile?.gender || "").trim(),
    occupation: String(profile?.occupation || "").trim(),
    income: String(profile?.income ?? profile?.annual_income ?? "").trim(),
    state: String(profile?.state || location?.state || "").trim(),
    city: String(profile?.city || location?.city || "").trim(),
    district: String(profile?.district || location?.district || "").trim(),
    pincode: String(profile?.pincode || profile?.pin_code || location?.pincode || "").trim(),
    category: String(profile?.category || "").trim(),
    aadhaar_number: String(profile?.aadhaar_number || "").trim(),
    pan_number: String(profile?.pan_number || "").trim(),
    bank_account: String(profile?.bank_account || "").trim(),
    ifsc_code: String(profile?.ifsc_code || "").trim(),
    address: String(profile?.address || "").trim(),
    address_line_1: String(profile?.address_line_1 || "").trim(),
    address_line_2: String(profile?.address_line_2 || "").trim(),
    father_name: String(profile?.father_name || profile?.father || "").trim(),
    husband_name: String(profile?.husband_name || profile?.spouse_name || "").trim(),
    guardian_name: String(profile?.guardian_name || profile?.care_of || "").trim(),
    eshram_uan: String(profile?.eshram_uan || profile?.uan_number || "").trim(),
    vid_number: String(profile?.vid_number || "").trim(),
    email: String(user?.email || profile?.email || "").trim(),
    phone: String(user?.phone || profile?.phone || profile?.mobile_number || "").trim(),
  };
};

const deriveProfileSignals = (profile = {}) => {
  const output = { ...profile };
  const state = normalizeText(output.state || output.location?.state || "");
  if (!output.north_eastern_region && state) {
    output.north_eastern_region = NORTH_EAST_STATES.has(state) ? "yes" : "no";
  }

  if (!output.pincode && output.address) {
    const pin = String(output.address).match(/\b(\d{6})\b/);
    if (pin?.[1]) output.pincode = pin[1];
  }

  if (!output.verification_type) {
    output.verification_type = output.aadhaar_number ? "aadhaar" : output.vid_number ? "vid" : "";
  }

  if (output.email && !output.email_id) output.email_id = output.email;
  if (output.phone && !output.mobile_number) output.mobile_number = output.phone;
  if (output.bank_account && !output.account_number) output.account_number = output.bank_account;
  if (output.ifsc_code && !output.ifsc) output.ifsc = output.ifsc_code;
  if (output.aadhaar_number && !output.aadhaar) output.aadhaar = output.aadhaar_number;
  if (output.pan_number && !output.pan) output.pan = output.pan_number;
  if (output.income && !output.annual_income) output.annual_income = output.income;
  if (output.pincode && !output.pin_code) output.pin_code = output.pincode;

  return output;
};

const fillMissingFromDocuments = (profile = {}, documents = []) => {
  const output = { ...profile };
  const mergeIfMissing = (key, value) => {
    const text =
      value === null || value === undefined
        ? ""
        : Array.isArray(value)
          ? value.map((item) => String(item ?? "").trim()).filter(Boolean).join(", ")
          : String(value).trim();
    if (!text) return;
    const canonicalKey = canonicalizeProfileKey(key);
    if (!canonicalKey) return;
    if (String(output[canonicalKey] ?? "").trim()) return;
    output[canonicalKey] = text;
  };

  const mergeObjectScalars = (input = {}, prefix = "", depth = 0) => {
    if (!input || typeof input !== "object" || depth > 3) return;
    Object.entries(input).forEach(([rawKey, value]) => {
      const key = normalizeToken(rawKey);
      if (!key || value === null || value === undefined) return;
      const prefixedKey = prefix ? `${prefix}_${key}` : key;
      if (Array.isArray(value)) {
        mergeIfMissing(prefixedKey, value);
        mergeIfMissing(key, value);
        return;
      }
      if (typeof value === "object") {
        mergeObjectScalars(value, prefixedKey, depth + 1);
        return;
      }
      mergeIfMissing(prefixedKey, value);
      mergeIfMissing(key, value);
    });
  };

  for (const doc of documents) {
    const extracted = doc?.extracted_data || {};
    const autofill = doc?.autofill_fields || {};
    const dynamicAutofill =
      doc?.dynamic_schema?.autofill_payload && typeof doc.dynamic_schema.autofill_payload === "object"
        ? doc.dynamic_schema.autofill_payload
        : {};

    mergeIfMissing("name", extracted.name || extracted.candidate_name || autofill.applicant_name);
    mergeIfMissing("date_of_birth", extracted.date_of_birth || autofill.dob || dynamicAutofill.dob);
    mergeIfMissing(
      "aadhaar_number",
      extracted.aadhaar_number || autofill.aadhaar || dynamicAutofill.aadhaar
    );
    mergeIfMissing("pan_number", extracted.pan_number || autofill.pan || dynamicAutofill.pan);
    mergeIfMissing(
      "income",
      extracted.annual_income || autofill.annual_income || dynamicAutofill.annual_income
    );
    mergeIfMissing(
      "bank_account",
      extracted.account_number || autofill.bank_account || dynamicAutofill.bank_account
    );
    mergeIfMissing("ifsc_code", extracted.ifsc_code || autofill.ifsc || dynamicAutofill.ifsc);
    mergeIfMissing("address", extracted.address || autofill.address || dynamicAutofill.address);
    mergeObjectScalars(extracted);
    mergeObjectScalars(autofill);
    mergeObjectScalars(dynamicAutofill);
  }
  return output;
};

const applyMergedAutofillToProfile = (profile = {}, mergedAutofill = {}) => {
  const output = { ...profile };
  const source = mergedAutofill && typeof mergedAutofill === "object" ? mergedAutofill : {};
  const setIfMissing = (key, ...values) => {
    const canonicalKey = canonicalizeProfileKey(key);
    if (!canonicalKey) return;
    if (String(output[canonicalKey] || "").trim()) return;
    for (const value of values) {
      const text =
        value === null || value === undefined
          ? ""
          : Array.isArray(value)
            ? value.map((item) => String(item ?? "").trim()).filter(Boolean).join(", ")
            : String(value).trim();
      if (!text) continue;
      output[canonicalKey] = text;
      return;
    }
  };

  setIfMissing("name", source.name, source.applicant_name, source.candidate_name);
  setIfMissing("date_of_birth", source.date_of_birth, source.dob, source.birth_date);
  setIfMissing("aadhaar_number", source.aadhaar_number, source.aadhaar, source.uid);
  setIfMissing("pan_number", source.pan_number, source.pan);
  setIfMissing("income", source.income, source.annual_income, source.family_income);
  setIfMissing("bank_account", source.bank_account, source.account_number);
  setIfMissing("ifsc_code", source.ifsc_code, source.ifsc);
  setIfMissing("address", source.address);
  setIfMissing("email", source.email);
  setIfMissing("phone", source.phone, source.mobile, source.mobile_number);
  setIfMissing("city", source.city, source.location_city);
  setIfMissing("district", source.district, source.location_district);
  setIfMissing("state", source.state, source.location_state);
  setIfMissing("pincode", source.pincode, source.pin_code, source.postal_code, source.location_pincode);
  setIfMissing("father_name", source.father_name, source.father_s_name, source.father);
  setIfMissing("husband_name", source.husband_name, source.husband_s_name, source.spouse_name);
  setIfMissing("guardian_name", source.guardian_name, source.care_of, source.c_o);
  setIfMissing("address_line_1", source.address_line_1, source.address1);
  setIfMissing("address_line_2", source.address_line_2, source.address2);
  setIfMissing("eshram_uan", source.eshram_uan, source.uan_number);

  Object.entries(source).forEach(([rawKey, value]) => {
    const normalizedKey = normalizeToken(rawKey);
    if (!normalizedKey) return;
    if (value === null || value === undefined || typeof value === "object") return;
    setIfMissing(normalizedKey, value);
  });

  return output;
};

const buildAutofillData = ({ userProfile = {}, documents = [] }) => {
  const merged = { ...deriveProfileSignals(userProfile) };
  const mergeValueIfMissing = (key, value) => {
    const canonicalKey = canonicalizeProfileKey(key);
    if (!canonicalKey) return;
    if (merged[canonicalKey] !== null && merged[canonicalKey] !== undefined && merged[canonicalKey] !== "") {
      return;
    }
    const text =
      value === null || value === undefined
        ? ""
        : Array.isArray(value)
          ? value.map((item) => String(item ?? "").trim()).filter(Boolean).join(", ")
          : String(value).trim();
    if (!text) return;
    merged[canonicalKey] = text;
  };

  for (const doc of documents) {
    const extracted = doc?.extracted_data || {};
    const autofill = doc?.autofill_fields || {};
    const dynamicAutofill =
      doc?.dynamic_schema?.autofill_payload && typeof doc.dynamic_schema.autofill_payload === "object"
        ? doc.dynamic_schema.autofill_payload
        : {};
    Object.entries(extracted).forEach(([key, value]) => {
      mergeValueIfMissing(key, value);
    });
    Object.entries(autofill).forEach(([key, value]) => {
      mergeValueIfMissing(key, value);
    });
    Object.entries(dynamicAutofill).forEach(([key, value]) => {
      mergeValueIfMissing(key, value);
    });
  }
  if (!merged.name && merged.applicant_name) merged.name = merged.applicant_name;
  if (!merged.date_of_birth && merged.dob) merged.date_of_birth = merged.dob;
  if (!merged.aadhaar_number && merged.aadhaar) merged.aadhaar_number = merged.aadhaar;
  if (!merged.pan_number && merged.pan) merged.pan_number = merged.pan;
  if (!merged.bank_account && merged.account_number) merged.bank_account = merged.account_number;
  if (!merged.income && merged.annual_income) merged.income = merged.annual_income;
  return deriveProfileSignals(merged);
};

const buildUserDataFromSnapshot = (snapshot = {}) => {
  const user = snapshot?.user && typeof snapshot.user === "object" ? snapshot.user : {};
  return {
    name: String(user?.name || "").trim(),
    email: String(user?.email || "").trim(),
    phone: String(user?.phone || "").trim(),
  };
};

const pickSchemeLink = (scheme = {}) =>
  String(
    scheme?.official_application_link ||
      scheme?.apply_link ||
      scheme?.original_apply_link ||
      scheme?.scheme_link ||
      scheme?.scheme_page_link ||
      ""
  ).trim();

const sameHost = (urlA, urlB) => {
  try {
    const a = new URL(String(urlA || ""));
    const b = new URL(String(urlB || ""));
    return a.hostname.toLowerCase() === b.hostname.toLowerCase();
  } catch {
    return false;
  }
};

const findSchemeForPage = (recommendations = [], pageUrl = "") => {
  if (!Array.isArray(recommendations) || recommendations.length === 0) return null;
  const exactHost = recommendations.find((scheme) => sameHost(pickSchemeLink(scheme), pageUrl));
  if (exactHost) return exactHost;
  return recommendations[0] || null;
};

const resolveApiBases = (snapshot = {}) => {
  const candidates = [];
  const appOrigin = String(snapshot?.app_origin || "").trim();
  if (appOrigin) {
    candidates.push(trimSlashes(appOrigin));
    candidates.push(trimSlashes(`${appOrigin}/api`));
  }
  DEFAULT_API_BASES.forEach((base) => candidates.push(trimSlashes(base)));

  return uniqueStrings(candidates).filter(Boolean);
};

const requestBackendJson = async ({
  snapshot,
  path,
  method = "GET",
  body = null,
}) => {
  const token = String(snapshot?.token || "").trim();
  if (!token) {
    throw new Error("No auth token available. Login in Gov Assist app first.");
  }

  const bases = resolveApiBases(snapshot);
  if (bases.length === 0) {
    throw new Error("No API base URL candidates available");
  }

  let lastError = "API request failed";
  for (const base of bases) {
    const url = `${trimSlashes(base)}${withLeadingSlash(path)}`;
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await response.text();
      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      if (!response.ok) {
        const apiMessage =
          (json && (json.message || json.error)) ||
          `API ${response.status} on ${url}`;
        lastError = apiMessage;
        continue;
      }

      return {
        ok: true,
        status: response.status,
        base,
        url,
        data: json || {},
      };
    } catch (error) {
      lastError = error?.message || `Network error on ${url}`;
    }
  }

  throw new Error(lastError);
};

const buildContextEnvelope = ({
  scheme = {},
  userData = {},
  profileData = {},
  userProfile = {},
  documents = [],
  autofillData = {},
  recommendationMeta = {},
  contextOrigin = "backend_bootstrap",
}) => ({
  source: CONTEXT_SOURCE,
  type: CONTEXT_TYPE,
  created_at: toIso(new Date()),
  payload: {
    scheme: {
      scheme_name: String(scheme?.scheme_name || "Government Scheme Application").trim(),
      official_application_link: String(
        scheme?.official_application_link || scheme?.apply_link || ""
      ).trim(),
      documents_required: Array.isArray(scheme?.documents_required)
        ? scheme.documents_required
        : [],
    },
    user_data: userData || {},
    profile_data: profileData || {},
    user_profile: userProfile || {},
    autofill_data: autofillData || {},
    documents: documents || [],
    recommendation_meta:
      recommendationMeta && typeof recommendationMeta === "object" ? recommendationMeta : {},
    automation_preview: null,
    context_origin: contextOrigin,
  },
});

const bootstrapContextFromBackend = async ({
  pageUrl = "",
  markPending = false,
} = {}) => {
  const snapshot = await getAuthSnapshot();
  if (!snapshot?.token) return null;

  let documents = [];
  let recommendations = [];
  let recommendationBase = "";
  let mergedAutofillFields = {};
  let mergedExtractedData = {};
  let mergedContextFromDb = {};
  let recommendationMeta = {};
  try {
    const docsResponse = await requestBackendJson({
      snapshot,
      path: "/documents/my",
      method: "GET",
    });
    documents = toDocumentList(docsResponse?.data?.documents || []);
    mergedAutofillFields =
      docsResponse?.data?.merged_autofill_fields &&
      typeof docsResponse.data.merged_autofill_fields === "object"
        ? docsResponse.data.merged_autofill_fields
        : {};
    mergedExtractedData =
      docsResponse?.data?.merged_extracted_data &&
      typeof docsResponse.data.merged_extracted_data === "object"
        ? docsResponse.data.merged_extracted_data
        : {};
    mergedContextFromDb =
      docsResponse?.data?.autofill_context && typeof docsResponse.data.autofill_context === "object"
        ? docsResponse.data.autofill_context
        : {};
    recommendationBase = docsResponse.base || recommendationBase;
  } catch {
    documents = [];
    mergedAutofillFields = {};
    mergedExtractedData = {};
    mergedContextFromDb = {};
  }

  try {
    const recommendationResponse = await requestBackendJson({
      snapshot,
      path: "/recommend-schemes",
      method: "GET",
    });
    recommendations = Array.isArray(recommendationResponse?.data?.recommendations)
      ? recommendationResponse.data.recommendations
      : [];
    recommendationBase = recommendationResponse.base || recommendationBase;
    recommendationMeta = {
      source: "backend_recommendation_api",
      total_recommendations: Number(
        recommendationResponse?.data?.total_recommendations || recommendations.length || 0
      ),
      best_match: String(recommendationResponse?.data?.best_match?.scheme_name || "").trim(),
      best_match_score: Number(recommendationResponse?.data?.best_match?.match_probability || 0),
      profile_signature: String(recommendationResponse?.data?.profile_signature || "").trim(),
      recommendation_engine_version: String(
        recommendationResponse?.data?.recommendation_engine_version || ""
      ).trim(),
      profile_context_source: String(
        recommendationResponse?.data?.profile_context_source || ""
      ).trim(),
    };
  } catch {
    recommendations = [];
    recommendationMeta = {};
  }

  const matchedScheme = findSchemeForPage(recommendations, pageUrl);
  const schemeLink = pageUrl || pickSchemeLink(matchedScheme);
  const schemeRequired = Array.isArray(matchedScheme?.documents_required)
    ? matchedScheme.documents_required
    : [];

  const userProfile = deriveProfileSignals(applyMergedAutofillToProfile(
    fillMissingFromDocuments(mapProfileFromSnapshot(snapshot), documents),
    {
      ...(mergedContextFromDb?.extracted_data || {}),
      ...(mergedContextFromDb?.autofill_fields || {}),
      ...(mergedExtractedData || {}),
      ...(mergedAutofillFields || {}),
    }
  ));
  const userData = buildUserDataFromSnapshot(snapshot);
  const profileData = snapshot?.profile && typeof snapshot.profile === "object" ? snapshot.profile : {};
  const autofillData = buildAutofillData({
    userProfile: {
      ...(userData || {}),
      ...(profileData || {}),
      ...userProfile,
      ...(mergedContextFromDb?.extracted_data || {}),
      ...(mergedContextFromDb?.autofill_fields || {}),
      ...(mergedExtractedData || {}),
      ...(mergedAutofillFields || {}),
    },
    documents,
  });

  const envelope = buildContextEnvelope({
    scheme: {
      scheme_name: String(matchedScheme?.scheme_name || "Government Scheme Application").trim(),
      official_application_link: schemeLink,
      documents_required: schemeRequired,
    },
    userData,
    profileData,
    userProfile,
    documents,
    autofillData,
    recommendationMeta: {
      ...recommendationMeta,
      profile_signature:
        recommendationMeta.profile_signature ||
        buildProfileSignature(profileData || userProfile || {}),
    },
    contextOrigin: "backend_bootstrap",
  });

  await setStorage({
    [CONTEXT_KEY]: envelope,
    [PENDING_KEY]: Boolean(markPending),
    [AUTH_SNAPSHOT_KEY]: {
      ...snapshot,
      api_base: recommendationBase || snapshot.api_base || "",
    },
  });

  return envelope;
};

const shouldRefreshCachedContext = (envelope, snapshot) => {
  if (!envelope || typeof envelope !== "object") return false;
  if (!snapshot?.profile || typeof snapshot.profile !== "object") return false;

  const cachedSignature = normalizeText(
    envelope?.payload?.recommendation_meta?.profile_signature || ""
  );
  const latestSignature = normalizeText(buildProfileSignature(snapshot.profile));

  if (!latestSignature) return false;
  if (!cachedSignature) return true;
  return cachedSignature !== latestSignature;
};

const getContextWithFallback = async ({ pageUrl = "", markPendingOnBootstrap = false } = {}) => {
  const state = await getStorage([CONTEXT_KEY]);
  const cachedEnvelope = state[CONTEXT_KEY] || null;
  if (cachedEnvelope) {
    const snapshot = await getAuthSnapshot();
    if (!shouldRefreshCachedContext(cachedEnvelope, snapshot)) {
      return cachedEnvelope;
    }

    const refreshed = await bootstrapContextFromBackend({
      pageUrl,
      markPending: markPendingOnBootstrap,
    });
    return refreshed || cachedEnvelope;
  }

  const appContext = await fetchContextFromAppTabs({ markPending: true });
  if (appContext) return appContext;

  return bootstrapContextFromBackend({
    pageUrl,
    markPending: markPendingOnBootstrap,
  });
};

const coerceFormField = (field = {}, index = 0) => {
  const coerceOptions = (options) => {
    if (!Array.isArray(options)) return [];
    return options
      .map((option) => {
        if (typeof option === "string") {
          return {
            label: option.trim(),
            value: option.trim(),
          };
        }
        return {
          label: String(option?.label ?? option?.value ?? "").trim(),
          value: String(option?.value ?? option?.label ?? "").trim(),
        };
      })
      .filter((option) => option.label || option.value);
  };

  return {
    label: String(field?.label || "").trim(),
    name: String(field?.name || "").trim() || `field_${index + 1}`,
    id: String(field?.id || "").trim(),
    selector: String(field?.selector || "").trim(),
    type: String(field?.type || "text").trim(),
    placeholder: String(field?.placeholder || "").trim(),
    required: Boolean(field?.required),
    options: coerceOptions(field?.options),
  };
};

const normalizeAutomationActions = (payload = {}) => {
  const steps = Array.isArray(payload?.automation_steps)
    ? payload.automation_steps
    : Array.isArray(payload?.actions)
      ? payload.actions
      : [];

  return steps
    .map((step) => {
      const type = normalizeToken(step?.type || step?.action);
      if (!type) return null;

      if (type === "fill_input" || type === "select_dropdown") {
        return {
          type,
          field: String(step?.field || step?.name || "").trim(),
          selector: String(step?.selector || "").trim(),
          value: String(step?.value ?? "").trim(),
        };
      }
      if (type === "upload_file") {
        return {
          type,
          field: String(step?.field || step?.name || "").trim(),
          selector: String(step?.selector || "").trim(),
          file_url: String(step?.file_url || "").trim(),
          document_name: String(
            step?.document_name || step?.required_document_name || step?.matched_document_name || ""
          ).trim(),
        };
      }
      if (type === "click" || type === "click_radio" || type === "click_checkbox") {
        return {
          type: "click",
          field: String(step?.field || step?.name || "").trim(),
          selector: String(step?.selector || "").trim(),
          value: String(step?.value ?? "").trim(),
        };
      }
      return null;
    })
    .filter(Boolean);
};

const buildPlanFromBackend = async (message = {}) => {
  const pageUrl = String(message?.page_url || "").trim();
  const formFieldsRaw = Array.isArray(message?.form_structure?.fields)
    ? message.form_structure.fields
    : [];
  const fields = formFieldsRaw.map(coerceFormField).filter((field) => field.name || field.label);

  if (!pageUrl) {
    throw new Error("page_url is required to build autofill plan");
  }
  if (fields.length === 0) {
    throw new Error("form_structure.fields is required");
  }
  if (!isOfficialHost(pageUrl)) {
    throw new Error("Autofill plan is allowed only for official government portals.");
  }

  const snapshot = await getAuthSnapshot();
  if (!snapshot?.token) {
    throw new Error("No auth token found. Login in Gov Assist app first.");
  }

  const providedDocs = toDocumentList(message?.documents || []);
  let documents = providedDocs;
  let mergedAutofillFromDb = {};
  let mergedExtractedFromDb = {};
  if (documents.length === 0) {
    try {
      const docsResponse = await requestBackendJson({
        snapshot,
        path: "/documents/my",
        method: "GET",
      });
      documents = toDocumentList(docsResponse?.data?.documents || []);
      mergedAutofillFromDb =
        docsResponse?.data?.merged_autofill_fields &&
        typeof docsResponse.data.merged_autofill_fields === "object"
          ? docsResponse.data.merged_autofill_fields
          : {};
      mergedExtractedFromDb =
        docsResponse?.data?.merged_extracted_data &&
        typeof docsResponse.data.merged_extracted_data === "object"
          ? docsResponse.data.merged_extracted_data
          : {};
    } catch {
      documents = [];
      mergedAutofillFromDb = {};
      mergedExtractedFromDb = {};
    }
  }

  const snapshotProfile = applyMergedAutofillToProfile(
    fillMissingFromDocuments(mapProfileFromSnapshot(snapshot), documents),
    {
      ...(mergedExtractedFromDb || {}),
      ...(mergedAutofillFromDb || {}),
    }
  );
  const userProfileInput =
    message?.user_profile && typeof message.user_profile === "object" ? message.user_profile : {};
  const userDataInput =
    message?.user_data && typeof message.user_data === "object" ? message.user_data : {};
  const profileDataInput =
    message?.profile_data && typeof message.profile_data === "object" ? message.profile_data : {};
  const mergedUserProfile = deriveProfileSignals(fillMissingFromDocuments(
    {
      ...userDataInput,
      ...profileDataInput,
      ...snapshotProfile,
      ...userProfileInput,
    },
    documents
  ));

  const schemeInput = message?.scheme_data && typeof message.scheme_data === "object" ? message.scheme_data : {};
  const schemeData = {
    scheme_name: String(schemeInput?.scheme_name || "Government Scheme Application").trim(),
    official_application_link: pageUrl,
    documents_required: Array.isArray(schemeInput?.documents_required)
      ? schemeInput.documents_required
      : [],
  };

  const response = await requestBackendJson({
    snapshot,
    path: "/automation/generate-steps",
    method: "POST",
    body: {
      scheme_data: schemeData,
      user_data:
        (userDataInput && Object.keys(userDataInput).length > 0 ? userDataInput : mergedUserProfile) || {},
      profile_data: profileDataInput || {},
      user_profile: mergedUserProfile,
      autofill_data: buildAutofillData({
        userProfile: mergedUserProfile,
        documents,
      }),
      user_documents: {
        documents: documents.map((doc) => ({
          document_name: doc.document_name,
          cloudinary_url: doc.cloudinary_url,
          extracted_data:
            doc?.extracted_data && typeof doc.extracted_data === "object" ? doc.extracted_data : {},
          autofill_fields:
            doc?.autofill_fields && typeof doc.autofill_fields === "object" ? doc.autofill_fields : {},
          dynamic_schema:
            doc?.dynamic_schema && typeof doc.dynamic_schema === "object" ? doc.dynamic_schema : {},
        })),
      },
      form_structure: {
        fields,
      },
      generate_fallback_guide: false,
    },
  });

  const data = response?.data || {};
  return {
    ok: true,
    api_base: response.base || "",
    plan: data,
    actions: normalizeAutomationActions(data),
    missing_required_documents: Array.isArray(data?.missing_required_documents)
      ? data.missing_required_documents
      : [],
    missing_profile_fields: Array.isArray(data?.missing_profile_fields)
      ? data.missing_profile_fields
      : [],
    constraints: data?.constraints || {},
    safety_notes: Array.isArray(data?.safety_notes) ? data.safety_notes : [],
  };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = canonicalMessageType(message);

  (async () => {
    if (type === "store_autofill_context") {
      await setStorage({
        [CONTEXT_KEY]: message?.envelope || null,
        [PENDING_KEY]: true,
        [LAST_RESULT_KEY]: null,
      });
      sendResponse({ ok: true });
      return;
    }

    if (type === "sync_context_from_app") {
      let envelope = await fetchContextFromAppTabs({ markPending: true });
      if (!envelope) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        envelope = await bootstrapContextFromBackend({
          pageUrl: String(activeTab?.url || "").trim(),
          markPending: false,
        });
      }
      if (!envelope) {
        sendResponse({
          ok: false,
          error: "Could not sync context. Open Gov Assist app and login first.",
        });
        return;
      }
      sendResponse({
        ok: true,
        envelope,
      });
      return;
    }

    if (type === "get_autofill_context") {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const envelope = await getContextWithFallback({
        pageUrl: String(activeTab?.url || "").trim(),
        markPendingOnBootstrap: false,
      });
      const state = await getStorage([PENDING_KEY]);
      sendResponse({
        ok: true,
        envelope: envelope || null,
        pending: Boolean(state[PENDING_KEY]),
      });
      return;
    }

    if (type === "store_last_autofill_result") {
      await setStorage({
        [LAST_RESULT_KEY]: message?.result || null,
      });
      sendResponse({ ok: true });
      return;
    }

    if (type === "get_last_autofill_result") {
      const state = await getStorage([LAST_RESULT_KEY]);
      sendResponse({
        ok: true,
        result: state[LAST_RESULT_KEY] || null,
      });
      return;
    }

    if (type === "download_file_from_url") {
      const url = String(message?.url || "").trim();
      if (!url) {
        sendResponse({
          ok: false,
          error: "Missing URL",
        });
        return;
      }
      try {
        const file = await downloadFileAsBase64(url);
        sendResponse({
          ok: true,
          ...file,
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error?.message || "Unable to download file",
        });
      }
      return;
    }

    if (type === "clear_autofill_context") {
      await setStorage({
        [CONTEXT_KEY]: null,
        [PENDING_KEY]: false,
        [LAST_RESULT_KEY]: null,
      });
      sendResponse({ ok: true });
      return;
    }

    if (type === "build_autofill_plan") {
      try {
        const result = await buildPlanFromBackend(message);
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error?.message || "Failed to build backend autofill plan",
        });
      }
      return;
    }

    if (type === "autofill_active_tab") {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        sendResponse({ ok: false, error: "No active tab found" });
        return;
      }

      const pageUrl = String(activeTab?.url || "").trim();
      if (!isOfficialHost(pageUrl)) {
        sendResponse({
          ok: false,
          error: "Autofill is allowed only on official government portals.",
        });
        return;
      }

      let envelope = await getContextWithFallback({
        pageUrl,
        markPendingOnBootstrap: false,
      });
      if (!envelope) {
        sendResponse({
          ok: false,
          error: "No context available. Open Gov Assist app and login first.",
        });
        return;
      }

      if (!String(envelope?.payload?.scheme?.official_application_link || "").trim()) {
        envelope = {
          ...envelope,
          payload: {
            ...(envelope.payload || {}),
            scheme: {
              ...(envelope.payload?.scheme || {}),
              official_application_link: pageUrl,
            },
          },
        };
        await setStorage({
          [CONTEXT_KEY]: envelope,
        });
      }

      const result = await runAutofillOnTab(activeTab.id, envelope);
      await setStorage({
        [LAST_RESULT_KEY]: result,
        [PENDING_KEY]: Boolean(!(result && result.ok)),
      });
      sendResponse(result);
      return;
    }

    sendResponse({
      ok: false,
      error: `Unknown message type: ${String(message?.type || message?.action || "").trim() || "empty"}`,
    });
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error?.message || "Background execution failed",
    });
  });

  return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!isOfficialHost(tab?.url)) return;

  const state = await getStorage([CONTEXT_KEY, PENDING_KEY]);
  let pending = Boolean(state[PENDING_KEY]);
  let envelope = state[CONTEXT_KEY] || null;
  if (!pending) return;

  if (!envelope) {
    envelope = await getContextWithFallback({
      pageUrl: String(tab?.url || "").trim(),
      markPendingOnBootstrap: false,
    });
    pending = Boolean(envelope);
  }
  if (!pending || !envelope) return;

  const result = await runAutofillOnTab(tabId, envelope);
  await setStorage({
    [LAST_RESULT_KEY]: result || null,
    [PENDING_KEY]: Boolean(!(result && result.ok)),
  });
});
