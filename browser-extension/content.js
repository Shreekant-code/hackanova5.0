const CONTEXT_SOURCE = "gov-scheme-platform";
const CONTEXT_TYPE = "SCHEME_AUTOFILL_CONTEXT";
const FLOATING_BUTTON_ID = "__gov_assist_autofill_btn";
const RESULT_PANEL_ID = "__gov_assist_autofill_panel";
const MAX_MULTI_STEP = 3;
const MAX_SCROLL_PASSES = 8;
const LOCAL_STORAGE_CONTEXT_KEY = "gov_platform_extension_payload";
const FIELD_MATCH_MIN_SCORE = 6;

const FIELD_KEYWORDS = {
  name: ["full name", "applicant name", "candidate name", "beneficiary name", "subscriber name", "name"],
  date_of_birth: ["date of birth", "dob", "birth date", "subscriber date of birth"],
  age: ["age"],
  gender: ["gender", "sex"],
  category: ["category", "caste", "social category"],
  father_name: ["father name", "father's name", "s/o", "d/o", "son of", "daughter of"],
  husband_name: ["husband name", "husband's name", "spouse name", "w/o", "wife of"],
  guardian_name: ["guardian name", "guardian's name", "care of", "c/o", "parent name"],
  occupation: ["occupation", "profession"],
  income: ["annual income", "income", "family income", "household income"],
  state: ["state", "state of residence"],
  city: ["city", "town"],
  address: ["address", "residential address", "permanent address"],
  email: ["email", "email id", "e-mail"],
  phone: ["phone", "mobile", "mobile number", "contact number"],
  aadhaar_number: ["aadhaar", "aadhar", "aadhaar number", "uid", "subscriber aadhaar"],
  vid_number: ["vid", "virtual id"],
  eshram_uan: ["e-shram uan", "eshram uan", "uan number", "subscriber uan"],
  pan_number: ["pan", "pan number"],
  bank_account: ["bank account", "account number", "subscriber account number"],
  ifsc_code: ["ifsc", "ifsc code"],
  institution_name: ["institution", "college", "university", "school", "institution name"],
  course: ["course", "programme", "program", "stream"],
  year_of_passing: ["year of passing", "passing year"],
  pincode: ["pincode", "pin code", "postal code", "zip code"],
  district: ["district", "city", "town"],
  north_eastern_region: ["north eastern region", "north east region", "belong to north eastern region"],
  income_tax_payer: ["income tax payer", "income taxpayer", "tax payer", "taxpayer"],
  nps_member: ["member beneficiary of nps esic epfo", "nps", "esic", "epfo", "nps esic epfo"],
  consent_authentication: ["consent for authentication", "authentication consent", "i hereby give my consent"],
  verification_type: ["verification type", "aadhaar vid", "aadhaar/vid"],
};

const DOCUMENT_KEYWORDS = {
  aadhaar_card: ["aadhaar", "aadhar", "uid"],
  pan_card: ["pan"],
  income_certificate: ["income certificate", "income proof", "annual income", "salary"],
  bank_passbook: ["passbook", "bank statement", "cancelled cheque", "bank account"],
  education_certificate: ["education", "marksheet", "degree", "certificate", "course"],
  disability_certificate: ["disability", "pwd", "divyang"],
  caste_certificate: ["caste", "category certificate", "sc", "st", "obc"],
  residence_certificate: ["domicile", "residence", "address proof"],
};

const KEY_ALIASES = {
  dob: "date_of_birth",
  date_of_birth: "date_of_birth",
  birth_date: "date_of_birth",
  year_of_birth: "date_of_birth",
  applicant_name: "name",
  candidate_name: "name",
  full_name: "name",
  father_s_name: "father_name",
  father: "father_name",
  spouse_name: "husband_name",
  husband_s_name: "husband_name",
  care_of: "guardian_name",
  c_o: "guardian_name",
  guardian: "guardian_name",
  aadhaar: "aadhaar_number",
  aadhar: "aadhaar_number",
  uid: "aadhaar_number",
  pan: "pan_number",
  pan_number: "pan_number",
  annual_income: "income",
  family_income: "income",
  household_income: "income",
  email_id: "email",
  mail_id: "email",
  mobile_number: "phone",
  contact_number: "phone",
  pin_code: "pincode",
  postal_code: "pincode",
  zip_code: "pincode",
  location_city: "city",
  location_district: "district",
  location_state: "state",
  location_pincode: "pincode",
  location_pin_code: "pincode",
  location_postal_code: "pincode",
  account_number: "bank_account",
  nps_esic_epfo_member: "nps_member",
  north_east_region: "north_eastern_region",
  tax_payer: "income_tax_payer",
  consent: "consent_authentication",
  ifsc: "ifsc_code",
  institution: "institution_name",
  college_name: "institution_name",
  year: "year_of_passing",
};

const normalizeKeyName = (value) =>
  normalize(
    String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

const FALLBACK_UPLOAD_PROFILE_KEYS = [
  "name",
  "date_of_birth",
  "age",
  "gender",
  "category",
  "occupation",
  "income",
  "state",
  "address",
  "phone",
  "email",
  "aadhaar_number",
  "pan_number",
];

const AUTH_KEYWORDS = ["login", "log in", "password", "sign in", "username", "otp"];
const CAPTCHA_KEYWORDS = ["captcha", "recaptcha", "hcaptcha", "i am not a robot"];

let autofillRunning = false;

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeActionType = (value) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeKeyToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const canonicalizeKey = (value) => {
  const normalized = normalizeKeyToken(value);
  if (!normalized) return "";
  return KEY_ALIASES[normalized] || normalized;
};

const toText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const sanitizeHintText = (value) =>
  toText(value)
    .replace(/\s+/g, " ")
    .replace(/\*/g, " ")
    .trim();

const isUsableHintText = (value) => {
  const text = sanitizeHintText(value);
  if (!text) return false;
  if (text.length < 2 || text.length > 120) return false;
  if (!/[a-z]/i.test(text)) return false;
  const words = text.split(" ").filter(Boolean);
  if (words.length > 14) return false;
  if (/^(verify|submit|next|previous|cancel|reset|search|clear)$/i.test(text)) return false;
  return true;
};

const getQueryableRoot = (element) => {
  const root = element?.getRootNode?.();
  return root && typeof root.querySelector === "function" ? root : document;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runtimeSendMessage = (payload) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }
      resolve(response || { ok: false });
    });
  });

const attrEscape = (value) => toText(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const cssEscape = (value) => {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value || ""));
  }
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
};

const isVisible = (element) => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  return true;
};

const getLabelText = (element) => {
  const chunks = [];
  const addChunk = (value) => {
    const clean = sanitizeHintText(value);
    if (!isUsableHintText(clean)) return;
    const signature = normalize(clean);
    if (!signature) return;
    if (chunks.some((item) => normalize(item) === signature)) return;
    chunks.push(clean);
  };

  if (element.labels && element.labels.length > 0) {
    Array.from(element.labels).forEach((label) => {
      addChunk(label.innerText || label.textContent || "");
    });
  }

  const id = element.getAttribute("id");
  if (id) {
    const root = getQueryableRoot(element);
    const external =
      root.querySelector?.(`label[for="${cssEscape(id)}"]`) ||
      document.querySelector(`label[for="${cssEscape(id)}"]`);
    addChunk(external?.innerText || external?.textContent || "");
  }

  const closest = element.closest("label");
  if (closest) {
    addChunk(closest.innerText || closest.textContent || "");
  }

  const ariaLabel = toText(element.getAttribute("aria-label"));
  if (ariaLabel) addChunk(ariaLabel);

  const labelledBy = toText(element.getAttribute("aria-labelledby"));
  if (labelledBy) {
    const root = getQueryableRoot(element);
    labelledBy
      .split(/\s+/g)
      .map((token) => toText(token))
      .filter(Boolean)
      .forEach((idToken) => {
        const node =
          root.querySelector?.(`#${cssEscape(idToken)}`) || document.getElementById(idToken);
        addChunk(node?.innerText || node?.textContent || "");
      });
  }

  const walkSibling = (start, direction, limit = 3) => {
    let pointer = start;
    let count = 0;
    while (pointer && count < limit) {
      addChunk(pointer.innerText || pointer.textContent || "");
      pointer = pointer[direction];
      count += 1;
    }
  };

  walkSibling(element.previousElementSibling, "previousElementSibling", 2);
  walkSibling(element.nextElementSibling, "nextElementSibling", 1);

  const group = element.closest(
    ".form-group, .form-field, .field, .input-group, .mat-form-field, .ant-form-item, .control, td, th, li, div"
  );
  if (group) {
    const scopedLabel = group.querySelector?.(
      "label, .form-label, .field-label, .control-label, legend, [data-label], [aria-label]"
    );
    if (scopedLabel && scopedLabel !== element && !scopedLabel.contains(element)) {
      addChunk(
        scopedLabel.getAttribute("aria-label") ||
          scopedLabel.getAttribute("data-label") ||
          scopedLabel.innerText ||
          scopedLabel.textContent ||
          ""
      );
    }
  }

  return chunks.join(" ");
};

const getNativePlaceholderText = (element) => {
  if (!element) return "";
  const text =
    toText(element.getAttribute("placeholder")) ||
    toText(element.placeholder || "") ||
    toText(element.getAttribute("aria-placeholder")) ||
    toText(element.getAttribute("data-placeholder")) ||
    toText(element.getAttribute("data-placeholder-text")) ||
    toText(element.getAttribute("title")) ||
    "";
  return isUsableHintText(text) ? sanitizeHintText(text) : "";
};

const getPlaceholderText = (element) => {
  if (!element) return "";
  const native = getNativePlaceholderText(element);
  if (native) return native;
  const contextual = sanitizeHintText(getLabelText(element));
  return isUsableHintText(contextual) ? contextual : "";
};

const getDescriptor = (element) =>
  normalize(
    [
      getLabelText(element),
      getPlaceholderText(element),
      element.getAttribute("aria-label") || "",
      element.getAttribute("name") || "",
      element.getAttribute("id") || "",
      element.getAttribute("class") || "",
      element.getAttribute("value") || "",
    ].join(" ")
  );

const inferType = (element) => {
  const tag = normalize(element.tagName);
  if (tag === "select") return "select";
  if (tag === "textarea") return "textarea";
  const inputType = normalize(element.getAttribute("type") || "text");
  return inputType || "text";
};

const resolveSelector = (element, fallbackIndex) => {
  const id = toText(element.getAttribute("id"));
  const name = toText(element.getAttribute("name"));
  const tag = normalize(element.tagName) || "input";
  const type = inferType(element);
  const value = toText(element.getAttribute("value"));

  if (id) return `#${cssEscape(id)}`;
  if (type === "radio" && name && value) {
    return `${tag}[name="${attrEscape(name)}"][value="${attrEscape(value)}"]`;
  }
  if (name) return `${tag}[name="${attrEscape(name)}"]`;

  const fallback =
    toText(fallbackIndex) || toText(element.getAttribute("data-gov-assist-index")) || "0";
  return `${tag}[data-gov-assist-index="${attrEscape(fallback)}"]`;
};

const isRequiredField = (element) => {
  const label = getLabelText(element);
  return Boolean(
    element.required || element.getAttribute("aria-required") === "true" || label.includes("*")
  );
};

const isSkippableInput = (type) =>
  ["hidden", "submit", "button", "reset", "image"].includes(type);

const extractOptions = (element) => {
  if (normalize(element.tagName) !== "select") return [];
  return Array.from(element.options || []).map((option) => ({
    label: toText(option.textContent),
    value: toText(option.value),
  }));
};

const collectFields = () => {
  const elements = Array.from(document.querySelectorAll("input, select, textarea"));
  const fields = [];
  let fallbackIndex = 1;

  elements.forEach((element) => {
    if (!isVisible(element)) return;
    const type = inferType(element);
    if (isSkippableInput(type)) return;

    let localFallbackIndex = "";
    if (!element.getAttribute("id") && !element.getAttribute("name")) {
      localFallbackIndex = String(fallbackIndex);
      element.setAttribute("data-gov-assist-index", localFallbackIndex);
      fallbackIndex += 1;
    }

    const nativePlaceholder = getNativePlaceholderText(element);
    const resolvedPlaceholder = nativePlaceholder || getPlaceholderText(element);

    const field = {
      element,
      descriptor: getDescriptor(element),
      placeholder: resolvedPlaceholder,
      placeholder_source: nativePlaceholder ? "native" : resolvedPlaceholder ? "derived_context" : "",
      label:
        toText(getLabelText(element)) ||
        resolvedPlaceholder ||
        toText(element.getAttribute("name")) ||
        toText(element.getAttribute("id")),
      type,
      tag: normalize(element.tagName),
      name: toText(element.getAttribute("name")),
      id: toText(element.getAttribute("id")),
      required: isRequiredField(element),
      selector: resolveSelector(element, localFallbackIndex),
      options: extractOptions(element),
    };

    fields.push(field);
  });

  return fields;
};

const detectFieldKey = (field) => {
  const optionDescriptor =
    field?.type === "select" && Array.isArray(field?.options)
      ? field.options.map((option) => `${toText(option?.label)} ${toText(option?.value)}`).join(" ")
      : "";
  const descriptor = normalize(
    `${field.label || ""} ${field.placeholder || ""} ${field.name || ""} ${field.id || ""} ${field.descriptor || ""} ${optionDescriptor}`
  );
  if (!descriptor) return "";

  if (
    field?.type === "radio" &&
    (descriptor.includes("verification type") || (descriptor.includes("aadhaar") && descriptor.includes("vid")))
  ) {
    return "verification_type";
  }

  if (field.type === "email") return "email";
  if (field.type === "tel") return "phone";

  let best = "";
  let bestScore = 0;

  Object.entries(FIELD_KEYWORDS).forEach(([key, words]) => {
    let score = 0;
    words.forEach((word) => {
      const token = normalize(word);
      if (!token) return;
      if (descriptor === token) score += 10;
      if (descriptor.includes(token)) score += 6;
      if (token.includes(descriptor) && descriptor.length > 2) score += 2;
    });
    if (field.name && normalize(field.name) === normalize(key)) score += 8;
    if (field.id && normalize(field.id) === normalize(key)) score += 8;

    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  });

  return bestScore >= FIELD_MATCH_MIN_SCORE ? best : "";
};

const getAliasCandidatesForKey = (key = "") => {
  const canonicalKey = canonicalizeKey(key) || String(key || "").trim();
  const normalizedTarget = normalize(canonicalKey);
  const candidates = new Set();
  if (!normalizedTarget) return [];

  candidates.add(String(canonicalKey || "").trim());
  candidates.add(String(canonicalKey || "").replace(/_/g, " "));
  candidates.add(normalizedTarget);
  candidates.add(String(canonicalKey || "").replace(/\s+/g, "_"));

  Object.entries(KEY_ALIASES).forEach(([alias, canonical]) => {
    if (normalize(canonical) === normalizedTarget) {
      candidates.add(alias);
    }
    if (normalize(alias) === normalizedTarget) {
      candidates.add(canonical);
    }
  });

  (FIELD_KEYWORDS[normalizedTarget] || []).forEach((token) => {
    candidates.add(token);
    candidates.add(String(token || "").replace(/\s+/g, "_"));
  });

  return Array.from(candidates).filter(Boolean);
};

const getDatasetValue = (dataset = {}, preferredKey = "", descriptorText = "") => {
  const source = dataset && typeof dataset === "object" ? dataset : {};
  const entries = Object.entries(source);
  if (entries.length === 0 || !preferredKey) {
    return {
      key: "",
      value: "",
    };
  }

  const descriptor = normalize(descriptorText);
  const candidates = getAliasCandidatesForKey(preferredKey);

  for (const candidate of candidates) {
    const target = normalizeKeyName(candidate);
    const hit = entries.find(([datasetKey, value]) => {
      if (!toText(value)) return false;
      return (
        normalizeKeyName(datasetKey) === target ||
        normalizeKeyName(canonicalizeKey(datasetKey) || datasetKey) === target
      );
    });
    if (hit) {
      return {
        key: hit[0],
        value: toText(hit[1]),
      };
    }
  }

  let best = { score: 0, key: "", value: "" };
  for (const [datasetKey, rawValue] of entries) {
    const value = toText(rawValue);
    if (!value) continue;
    const datasetKeyText = normalizeKeyName(canonicalizeKey(datasetKey) || datasetKey);
    let score = 0;

    candidates.forEach((candidate) => {
      const token = normalizeKeyName(candidate);
      if (!token) return;
      if (datasetKeyText === token) score += 10;
      if (datasetKeyText.includes(token) || token.includes(datasetKeyText)) score += 6;
      token
        .split(" ")
        .filter(Boolean)
        .forEach((word) => {
          if (datasetKeyText.includes(word)) score += 1;
          if (descriptor.includes(word)) score += 1;
        });
    });

    if (score > best.score) {
      best = {
        score,
        key: datasetKey,
        value,
      };
    }
  }

  if (best.score >= 4) {
    return {
      key: best.key,
      value: best.value,
    };
  }

  return {
    key: "",
    value: "",
  };
};

const inferDropdownKeyFromOptions = (field) => {
  if (field?.type !== "select") return "";
  const descriptor = normalize(
    `${field?.label || ""} ${field?.placeholder || ""} ${field?.name || ""} ${field?.id || ""} ${field?.descriptor || ""}`
  );
  const optionsText = normalize(
    (Array.isArray(field?.options) ? field.options : [])
      .map((option) => `${toText(option?.label)} ${toText(option?.value)}`)
      .join(" ")
  );

  if (!optionsText && !descriptor) return "";

  const includesAny = (text, tokens = []) =>
    tokens.some((token) => normalize(text).includes(normalize(token)));

  if (
    includesAny(optionsText, ["male", "female", "other", "woman", "man"]) ||
    includesAny(descriptor, FIELD_KEYWORDS.gender || [])
  ) {
    return "gender";
  }
  if (
    includesAny(optionsText, ["obc", "sc", "st", "ews", "general", "minority"]) ||
    includesAny(descriptor, FIELD_KEYWORDS.category || [])
  ) {
    return "category";
  }
  if (
    includesAny(descriptor, FIELD_KEYWORDS.state || []) ||
    includesAny(optionsText, ["andhra", "uttar", "maharashtra", "gujarat", "delhi", "karnataka"])
  ) {
    return "state";
  }
  if (
    includesAny(descriptor, FIELD_KEYWORDS.occupation || []) ||
    includesAny(optionsText, ["student", "farmer", "labour", "self employed", "business", "employee"])
  ) {
    return "occupation";
  }

  return "";
};

const detectFieldKeyFromDataset = (field, dataset = {}) => {
  const descriptor = normalize(
    `${field.label || ""} ${field.placeholder || ""} ${field.name || ""} ${field.id || ""} ${field.descriptor || ""}`
  );
  if (!descriptor) return "";

  let bestKey = "";
  let bestScore = 0;
  Object.keys(dataset || {}).forEach((candidateKey) => {
    const canonical = canonicalizeKey(candidateKey) || candidateKey;
    const tokens = new Set([
      normalizeKeyName(candidateKey),
      normalizeKeyName(canonical),
      ...getAliasCandidatesForKey(canonical).map((item) => normalizeKeyName(item)),
    ]);
    tokens.delete("");
    if (tokens.size === 0) return;

    let score = 0;
    tokens.forEach((keyText) => {
      if (descriptor === keyText) score += 10;
      if (descriptor.includes(keyText) || keyText.includes(descriptor)) score += 6;
      score += keyText
        .split(" ")
        .filter(Boolean)
        .filter((word) => descriptor.includes(word)).length;
    });

    if (score > bestScore) {
      bestScore = score;
      bestKey = candidateKey;
    }
  });

  return bestScore >= 4 ? bestKey : "";
};

const ensureElementInView = async (element) => {
  if (!element) return;
  try {
    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    });
  } catch {
    // ignore
  }
  await sleep(30);
};

const scoreDescriptorForKey = (descriptor = "", rawKey = "") => {
  const key = canonicalizeKey(rawKey) || rawKey;
  if (!descriptor || !key) return 0;
  const tokens = new Set(
    [
      key,
      ...getAliasCandidatesForKey(key),
    ]
      .map((item) => normalizeKeyName(item))
      .filter(Boolean)
  );
  if (tokens.size === 0) return 0;

  let score = 0;
  tokens.forEach((token) => {
    if (!token) return;
    if (descriptor === token) score += 12;
    if (descriptor.includes(token)) score += 8;
    if (token.includes(descriptor) && descriptor.length > 2) score += 3;
    score += token
      .split(" ")
      .filter(Boolean)
      .filter((word) => descriptor.includes(word)).length;
  });
  return score;
};

const resolveDatasetEntryForField = (field, dataset = {}, preferredCandidates = []) => {
  const descriptorText = `${field.label || ""} ${field.placeholder || ""} ${field.name || ""} ${field.id || ""} ${field.descriptor || ""}`;
  const descriptor = normalizeKeyName(descriptorText);
  const candidates = Array.from(
    new Set((preferredCandidates || []).map((item) => canonicalizeKey(item) || toText(item)).filter(Boolean))
  );

  for (const candidate of candidates) {
    const resolved = getDatasetValue(dataset, candidate, descriptorText);
    if (toText(resolved?.value)) {
      return {
        key: toText(resolved?.key || candidate),
        value: toText(resolved?.value),
        strategy: "candidate_alias",
        reason: `Matched using label/placeholder alias candidate "${toText(candidate)}".`,
      };
    }
  }

  let best = { score: 0, key: "", value: "" };
  Object.entries(dataset || {}).forEach(([datasetKey, rawValue]) => {
    const value = toText(rawValue);
    if (!value) return;
    const score = scoreDescriptorForKey(descriptor, datasetKey);
    if (score > best.score) {
      best = {
        score,
        key: datasetKey,
        value,
      };
    }
  });

  return best.score >= 6
    ? {
        key: best.key,
        value: best.value,
        strategy: "descriptor_fuzzy",
        reason: `Matched by descriptor fuzzy comparison (score ${best.score}).`,
      }
    : {
        key: "",
        value: "",
        strategy: "",
        reason: "",
      };
};

const SENSITIVE_MATCH_KEY_PATTERN =
  /\b(aadhaar|aadhar|pan|account|ifsc|password|otp|mobile|phone|email|vid|uan)\b/i;

const formatFieldDisplayName = (field = {}) =>
  toText(field?.label || field?.placeholder || field?.name || field?.id || "field");

const buildValuePreview = (key = "", value = "") => {
  const text = toText(value);
  if (!text) return "";
  if (SENSITIVE_MATCH_KEY_PATTERN.test(String(key || ""))) {
    if (text.length <= 4) return "*".repeat(text.length);
    return `${text.slice(0, 2)}${"*".repeat(Math.max(text.length - 4, 2))}${text.slice(-2)}`;
  }
  return text.length > 56 ? `${text.slice(0, 53)}...` : text;
};

const pushMatchingInsight = (bucket, insight = {}) => {
  if (!Array.isArray(bucket)) return;
  if (bucket.length >= 120) return;
  const field = toText(insight?.field);
  const reason = toText(insight?.reason);
  const action = toText(insight?.action);
  const sourceKey = toText(insight?.source_key);
  if (!field && !reason && !action && !sourceKey) return;
  bucket.push({
    phase: toText(insight?.phase || "heuristic"),
    action,
    field,
    source_key: sourceKey,
    value_preview: toText(insight?.value_preview),
    reason,
  });
};

const toInputDate = (value) => {
  const text = toText(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slash) {
    const dd = slash[1].padStart(2, "0");
    const mm = slash[2].padStart(2, "0");
    const yyyy = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toBooleanText = (value) => {
  const text = normalize(value);
  if (!text) return "";
  if (["true", "1", "yes", "y", "agree", "accepted"].includes(text)) return "yes";
  if (["false", "0", "no", "n", "decline", "not accepted"].includes(text)) return "no";
  return text;
};

const fireFieldEvents = (element) => {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const setElementValueCompat = (element, value) => {
  if (!element) return;
  const text = toText(value);
  const tag = normalize(element.tagName);
  try {
    if (tag === "textarea") {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement?.prototype || {},
        "value"
      )?.set;
      if (setter) setter.call(element, text);
      else element.value = text;
      return;
    }
    if (tag === "input") {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement?.prototype || {},
        "value"
      )?.set;
      if (setter) setter.call(element, text);
      else element.value = text;
      return;
    }
    element.value = text;
  } catch {
    element.value = text;
  }
};

const fillSelect = (element, value) => {
  const target = normalize(value);
  const options = Array.from(element.options || []);
  let match = null;
  let bestScore = 0;

  options.forEach((option) => {
    const optionValue = normalize(option.value);
    const optionLabel = normalize(option.textContent);
    let score = 0;
    if (optionValue === target || optionLabel === target) score += 20;
    if (optionValue.includes(target) || target.includes(optionValue)) score += 8;
    if (optionLabel.includes(target) || target.includes(optionLabel)) score += 8;
    score += target
      .split(" ")
      .filter(Boolean)
      .filter((word) => optionValue.includes(word) || optionLabel.includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      match = option;
    }
  });

  if (!match || bestScore <= 0) return false;

  element.value = match.value;
  fireFieldEvents(element);
  return true;
};

const fillRadio = (field, key, dataset) => {
  const name = toText(field.element.getAttribute("name"));
  if (!name) return false;
  const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`)).filter(isVisible);
  if (radios.length === 0) return false;

  const resolved = getDatasetValue(
    dataset,
    key,
    `${field.label || ""} ${field.placeholder || ""} ${field.name || ""} ${field.id || ""}`
  );
  const desired = normalize(resolved.value || "");
  const boolDesired = toBooleanText(resolved.value || "");
  let chosen =
    radios.find((radio) => normalize(radio.value) === desired || getDescriptor(radio).includes(desired)) ||
    null;

  if (!chosen && boolDesired) {
    chosen =
      radios.find((radio) => {
        const descriptor = getDescriptor(radio);
        return descriptor.includes(boolDesired) || normalize(radio.value) === boolDesired;
      }) || null;
  }

  if (!chosen && key === "verification_type") {
    chosen = radios.find((radio) => getDescriptor(radio).includes("aadhaar")) || null;
  }
  if (!chosen && key === "gender") {
    chosen =
      radios.find((radio) => getDescriptor(radio).includes(desired)) ||
      radios.find((radio) => normalize(radio.value).includes(desired)) ||
      null;
  }
  if (!chosen) return false;

  chosen.click();
  fireFieldEvents(chosen);
  return true;
};

const fillCheckbox = (field, key, dataset) => {
  const resolved = getDatasetValue(
    dataset,
    key,
    `${field.label || ""} ${field.placeholder || ""} ${field.name || ""} ${field.id || ""}`
  );
  const raw = toBooleanText(resolved.value || "");
  if (!raw) return false;
  const shouldCheck = raw === "yes";
  if (shouldCheck !== field.element.checked) {
    field.element.click();
    fireFieldEvents(field.element);
  }
  return true;
};

const fillInput = (field, value) => {
  const finalValue = field.type === "date" ? toInputDate(value) : toText(value);
  if (!finalValue) return false;
  const element = field.element;
  if (element.disabled || element.readOnly) return false;

  element.focus();
  setElementValueCompat(element, finalValue);
  fireFieldEvents(element);
  if (toText(element.value) !== finalValue) {
    setElementValueCompat(element, finalValue);
    fireFieldEvents(element);
  }
  element.blur();
  return toText(element.value) === finalValue;
};

const normalizeDocumentName = (name) => {
  const text = normalize(name).replace(/[^a-z0-9 ]+/g, " ");
  for (const [key, words] of Object.entries(DOCUMENT_KEYWORDS)) {
    if (words.some((word) => text.includes(normalize(word)))) return key;
  }
  return text.replace(/\s+/g, "_");
};

const tokenizeWords = (value) =>
  normalize(value)
    .split(/[^a-z0-9]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);

const parseAcceptTokens = (input) =>
  String(input || "")
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);

const inferMimeFromNameOrUrl = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text.includes("application/pdf")) return "application/pdf";
  if (text.includes("image/jpeg") || text.includes("image/jpg")) return "image/jpeg";
  if (text.includes("image/png")) return "image/png";
  if (text.includes("image/webp")) return "image/webp";

  const clean = text.split("?")[0].split("#")[0];
  const match = clean.match(/\.([a-z0-9]{2,5})$/i);
  const ext = match?.[1] || "";
  const map = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return map[ext] || "";
};

const inferDocumentMimeType = (document = {}) =>
  inferMimeFromNameOrUrl(document?.file_type || "") ||
  inferMimeFromNameOrUrl(document?.cloudinary_url || "") ||
  inferMimeFromNameOrUrl(document?.document_name || "");

const isMimeAcceptedByInput = (mimeType, acceptTokens = []) => {
  if (!mimeType) return true;
  if (!Array.isArray(acceptTokens) || acceptTokens.length === 0) return true;
  const tokenSet = new Set(acceptTokens);
  if (tokenSet.has("*/*")) return true;
  if (acceptTokens.includes(mimeType)) return true;
  if (mimeType.startsWith("image/") && acceptTokens.includes("image/*")) return true;
  if (mimeType === "application/pdf" && acceptTokens.includes(".pdf")) return true;
  if (mimeType === "image/jpeg" && (acceptTokens.includes(".jpg") || acceptTokens.includes(".jpeg"))) {
    return true;
  }
  if (mimeType === "image/png" && acceptTokens.includes(".png")) return true;
  if (mimeType === "image/webp" && acceptTokens.includes(".webp")) return true;
  return false;
};

const isDocumentAcceptedByField = (field, document) => {
  const acceptTokens = parseAcceptTokens(field?.element?.getAttribute("accept") || "");
  if (acceptTokens.length === 0) return true;
  const mimeType = inferDocumentMimeType(document);
  if (!mimeType) return true;
  return isMimeAcceptedByInput(mimeType, acceptTokens);
};

const scoreDocumentMatch = (field, document, { requiredDocs = [], preferredName = "" } = {}) => {
  const descriptor = normalize(
    `${field.label || ""} ${field.name || ""} ${field.id || ""} ${field.descriptor || ""}`
  );
  const docName = normalize(document?.document_name || "");
  const normalizedDoc = normalizeDocumentName(document?.document_name || "");
  const preferred = normalize(preferredName);
  const mimeType = inferDocumentMimeType(document);
  const descriptorTokens = tokenizeWords(descriptor);
  const docTokens = tokenizeWords(
    `${document?.document_name || ""} ${normalizedDoc.replace(/_/g, " ")}`
  );
  const requiredHits = Array.isArray(requiredDocs) ? requiredDocs : [];
  let score = 0;

  if (descriptor.includes(docName) || docName.includes(descriptor)) score += 6;
  if (descriptor.includes(normalizedDoc.replace(/_/g, " "))) score += 8;
  if (preferred && (docName.includes(preferred) || preferred.includes(docName))) score += 8;

  const keyWords = DOCUMENT_KEYWORDS[normalizedDoc] || [];
  keyWords.forEach((word) => {
    const token = normalize(word);
    if (descriptor.includes(token)) score += 4;
  });

  if (requiredHits.length > 0) {
    requiredHits.forEach((requiredName) => {
      const required = normalize(requiredName);
      if (!required) return;
      if (docName.includes(required) || required.includes(docName)) score += 4;
      const requiredTokens = tokenizeWords(required);
      const shared = requiredTokens.filter((token) => descriptorTokens.includes(token)).length;
      score += shared;
    });
  }

  const sharedTokens = docTokens.filter((token) => descriptorTokens.includes(token)).length;
  score += sharedTokens * 2;

  if (!isDocumentAcceptedByField(field, document)) score -= 10;
  if (mimeType === "application/pdf" && descriptor.includes("pdf")) score += 4;
  if (mimeType.startsWith("image/") && (descriptor.includes("photo") || descriptor.includes("image"))) {
    score += 4;
  }

  return score;
};

const findDocumentByName = (documents = [], targetName = "") => {
  const desired = normalize(targetName);
  if (!desired) return null;
  let best = null;
  let bestScore = 0;

  documents.forEach((doc) => {
    const docName = normalize(doc?.document_name || "");
    const docKey = normalize(normalizeDocumentName(doc?.document_name || "").replace(/_/g, " "));
    let score = 0;
    if (docName === desired || docKey === desired) score += 12;
    if (docName.includes(desired) || desired.includes(docName)) score += 8;
    if (docKey.includes(desired) || desired.includes(docKey)) score += 6;
    if (score > bestScore) {
      bestScore = score;
      best = doc;
    }
  });

  return bestScore >= 6 ? best : null;
};

const resolveUploadDocument = (
  field,
  documents = [],
  { requiredDocs = [], preferredName = "" } = {}
) => {
  if (!Array.isArray(documents) || documents.length === 0) return null;

  if (preferredName) {
    const exact = findDocumentByName(documents, preferredName);
    if (exact && isDocumentAcceptedByField(field, exact)) {
      return exact;
    }
  }

  let best = null;
  let bestScore = 0;
  documents.forEach((doc) => {
    const score = scoreDocumentMatch(field, doc, {
      requiredDocs,
      preferredName,
    });
    if (score > bestScore) {
      best = doc;
      bestScore = score;
    }
  });

  if (best && bestScore >= 2) return best;
  if (documents.length === 1 && isDocumentAcceptedByField(field, documents[0])) {
    return documents[0];
  }
  return null;
};

const inferFileName = (url, contentType) => {
  try {
    const parsed = new URL(url);
    const fileName = parsed.pathname.split("/").pop();
    if (fileName) return fileName;
  } catch {
    // ignore
  }
  const extByType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
  };
  const ext = extByType[normalize(contentType)] || "bin";
  return `document.${ext}`;
};

const base64ToBlob = (base64, mimeType = "application/octet-stream") => {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

const downloadFileViaBackground = async (fileUrl) => {
  const response = await runtimeSendMessage({
    type: "DOWNLOAD_FILE_FROM_URL",
    url: fileUrl,
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Background file download failed");
  }
  return response;
};

const setFileInputFromFile = (input, file) => {
  if (!file) throw new Error("Missing file for upload");
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  fireFieldEvents(input);
};

const setFileInputFromUrl = async (input, fileUrl) => {
  let blob = null;
  let fileName = "";

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`File fetch failed: ${response.status}`);
    }
    blob = await response.blob();
    fileName = inferFileName(fileUrl, blob.type || "");
  } catch {
    const downloaded = await downloadFileViaBackground(fileUrl);
    blob = base64ToBlob(downloaded.base64, downloaded.mime_type || "application/octet-stream");
    fileName = toText(downloaded.file_name) || inferFileName(fileUrl, downloaded.mime_type || "");
  }

  if (!blob || blob.size === 0) {
    throw new Error("Unable to create upload file from URL");
  }
  const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
  setFileInputFromFile(input, file);
};

const escapePdfText = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const splitToPdfLines = (lines = [], maxChars = 96) => {
  const output = [];
  lines.forEach((line) => {
    const text = String(line || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (text.length <= maxChars) {
      output.push(text);
      return;
    }
    const words = text.split(" ");
    let current = "";
    words.forEach((word) => {
      if (!current) {
        current = word;
        return;
      }
      if (`${current} ${word}`.length > maxChars) {
        output.push(current);
        current = word;
      } else {
        current = `${current} ${word}`;
      }
    });
    if (current) output.push(current);
  });
  return output;
};

const textByteLength = (value) => new TextEncoder().encode(String(value || "")).length;

const buildSimplePdfBlob = (lines = []) => {
  const pdfLines = splitToPdfLines(lines, 96);
  const contentLines = ["BT", "/F1 11 Tf", "40 800 Td"];
  let first = true;
  pdfLines.forEach((line) => {
    const escaped = escapePdfText(line);
    if (first) {
      contentLines.push(`(${escaped}) Tj`);
      first = false;
    } else {
      contentLines.push("0 -14 Td");
      contentLines.push(`(${escaped}) Tj`);
    }
  });
  contentLines.push("ET");
  const stream = contentLines.join("\n");

  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
  );
  objects.push(
    `4 0 obj\n<< /Length ${textByteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`
  );
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  const header = "%PDF-1.4\n";
  let body = "";
  const offsets = [0];
  objects.forEach((objectText) => {
    offsets.push(textByteLength(header + body));
    body += objectText;
  });

  const xrefOffset = textByteLength(header + body);
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([header + body + xref + trailer], { type: "application/pdf" });
};

const buildFallbackPngBlob = async (lines = []) => {
  const rendered = splitToPdfLines(lines, 56);
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = Math.max(900, 220 + rendered.length * 24);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable for generated image");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 28px Arial";
  ctx.fillText("Gov Assist Auto Generated Document", 48, 68);
  ctx.font = "18px Arial";
  let y = 116;
  rendered.forEach((line) => {
    ctx.fillText(String(line || ""), 48, y);
    y += 26;
  });

  const blob = await new Promise((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), "image/png");
  });
  if (!blob) throw new Error("Could not generate fallback image");
  return blob;
};

const sanitizeFileBaseName = (value) =>
  String(value || "document")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "document";

const shouldPreferImageFallback = (field) => {
  const acceptTokens = parseAcceptTokens(field?.element?.getAttribute("accept") || "");
  if (acceptTokens.length === 0) return false;
  const allowsPdf = acceptTokens.includes("application/pdf") || acceptTokens.includes(".pdf") || acceptTokens.includes("*/*");
  const allowsImage = acceptTokens.some(
    (token) =>
      token === "image/*" ||
      token.startsWith("image/") ||
      token === ".png" ||
      token === ".jpg" ||
      token === ".jpeg" ||
      token === ".webp"
  );
  return allowsImage && !allowsPdf;
};

const buildGeneratedUploadLines = ({
  field,
  dataset = {},
  documents = [],
  preferredName = "",
}) => {
  const lines = [
    `Target upload field: ${toText(field?.label || field?.name || field?.id || "document_upload")}`,
    `Preferred document: ${toText(preferredName || "Not specified")}`,
    `Generated at: ${new Date().toLocaleString()}`,
    "This file was auto-generated because no exact uploaded document was matched.",
    "Please verify and replace with official scanned document if needed.",
    "",
    "Profile Snapshot:",
  ];

  FALLBACK_UPLOAD_PROFILE_KEYS.forEach((key) => {
    const value = toText(dataset?.[key]);
    if (!value) return;
    lines.push(`${key.replace(/_/g, " ")}: ${value}`);
  });

  if (Array.isArray(documents) && documents.length > 0) {
    const names = documents.map((doc) => toText(doc?.document_name)).filter(Boolean);
    if (names.length > 0) {
      lines.push("");
      lines.push(`Available extracted documents: ${names.join(", ")}`);
    }
  }

  return lines;
};

const createGeneratedUploadFile = async ({
  field,
  dataset = {},
  documents = [],
  preferredName = "",
}) => {
  const lines = buildGeneratedUploadLines({
    field,
    dataset,
    documents,
    preferredName,
  });
  const baseName = sanitizeFileBaseName(
    preferredName || field?.label || field?.name || field?.id || "supporting_document"
  );

  if (shouldPreferImageFallback(field)) {
    const imageBlob = await buildFallbackPngBlob(lines);
    return new File([imageBlob], `${baseName}_auto.png`, { type: "image/png" });
  }

  const pdfBlob = buildSimplePdfBlob(lines);
  return new File([pdfBlob], `${baseName}_auto.pdf`, { type: "application/pdf" });
};

const autoScrollForDynamicContent = async () => {
  let lastHeight = 0;
  let stableCount = 0;

  for (let pass = 0; pass < MAX_SCROLL_PASSES; pass += 1) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(320);
    const nextHeight = document.body.scrollHeight;
    if (nextHeight <= lastHeight + 8) {
      stableCount += 1;
    } else {
      stableCount = 0;
    }
    lastHeight = nextHeight;
    if (stableCount >= 2) break;
  }
  window.scrollTo(0, 0);
  await sleep(100);
};

const hasKeyword = (value, words) => {
  const text = normalize(value);
  if (!text) return false;
  return words.some((word) => text.includes(normalize(word)));
};

const isManualConstraintField = (field) => {
  const descriptor = normalize(`${field.label || ""} ${field.name || ""} ${field.id || ""} ${field.descriptor || ""}`);
  if (!descriptor) return false;
  if (field.type === "password") return true;
  if (hasKeyword(descriptor, AUTH_KEYWORDS)) return true;
  if (hasKeyword(descriptor, CAPTCHA_KEYWORDS)) return true;
  return false;
};

const detectAuthOrCaptcha = (fields) => {
  let authDetected = false;
  let captchaDetected = false;
  fields.forEach((field) => {
    const descriptor = normalize(`${field.label} ${field.name} ${field.id} ${field.descriptor}`);
    if (hasKeyword(descriptor, AUTH_KEYWORDS) || field.type === "password") authDetected = true;
    if (hasKeyword(descriptor, CAPTCHA_KEYWORDS)) captchaDetected = true;
  });
  return {
    authDetected,
    captchaDetected,
  };
};

const findNextButton = (visited = new Set()) => {
  const nextWords = ["next", "continue", "proceed", "save and next", "next step", "go next", "further"];
  const blockedWords = ["submit", "final", "payment", "pay", "verify", "otp", "login", "sign in"];

  const candidates = Array.from(
    document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"], a.btn, a.button')
  ).filter((node) => isVisible(node) && !node.disabled && node.getAttribute("aria-disabled") !== "true");

  for (const node of candidates) {
    const text = normalize(node.innerText || node.textContent || node.value || "");
    if (!text) continue;
    if (!hasKeyword(text, nextWords)) continue;
    if (hasKeyword(text, blockedWords)) continue;
    const signature = `${text}|${node.id || ""}|${node.name || ""}`;
    if (visited.has(signature)) continue;
    visited.add(signature);
    return {
      node,
      text: toText(node.innerText || node.textContent || node.value || "Next"),
      signature,
    };
  }
  return null;
};

const validateRequiredFields = (fields) => {
  const missing = [];
  const processedRadioGroups = new Set();

  fields.forEach((field) => {
    if (!field.required) return;
    if (isManualConstraintField(field)) return;
    const label = field.label || field.name || field.id || "Required field";
    const element = field.element;
    const type = field.type;

    if (type === "radio") {
      const group = toText(element.getAttribute("name")) || field.selector;
      if (processedRadioGroups.has(group)) return;
      processedRadioGroups.add(group);
      const anyChecked = Array.from(document.querySelectorAll(`input[type="radio"][name="${cssEscape(group)}"]`)).some(
        (radio) => radio.checked
      );
      if (!anyChecked) missing.push(label);
      return;
    }

    if (type === "checkbox") {
      if (!element.checked) missing.push(label);
      return;
    }

    if (type === "file") {
      if (!element.files || element.files.length === 0) missing.push(label);
      return;
    }

    const value = toText(element.value);
    if (!value) missing.push(label);
  });

  return Array.from(new Set(missing));
};

const buildDataset = (envelope) => {
  const payload = envelope?.payload || {};
  const source = {};
  const registerSourceValue = (rawKey = "", rawValue = "") => {
    const key = normalizeKeyToken(rawKey);
    const text = toText(rawValue);
    if (!key || !text) return;
    if (!source[key]) source[key] = text;
  };
  const mergeSource = (input = {}, prefix = "", depth = 0) => {
    if (!input || typeof input !== "object") return;
    if (depth > 3) return;

    Object.entries(input).forEach(([rawKey, value]) => {
      const key = normalizeKeyToken(rawKey);
      if (!key || value === null || value === undefined) return;
      const prefixedKey = prefix ? `${prefix}_${key}` : key;

      if (Array.isArray(value)) {
        const joined = value.map((item) => toText(item)).filter(Boolean).join(", ");
        if (joined) {
          registerSourceValue(prefixedKey, joined);
          registerSourceValue(key, joined);
        }
        return;
      }

      if (typeof value === "object") {
        mergeSource(value, prefixedKey, depth + 1);
        return;
      }

      registerSourceValue(prefixedKey, value);
      registerSourceValue(key, value);
    });
  };

  // Priority order: user_data -> profile_data -> user_profile -> autofill_data -> extracted docs.
  mergeSource(payload.user_data || {});
  mergeSource(payload.profile_data || {});
  mergeSource(payload.user_profile || {});
  mergeSource(payload.autofill_data || {});

  const docs = Array.isArray(payload.documents) ? payload.documents : [];
  docs.forEach((doc) => {
    const extracted = doc?.extracted_data || {};
    const autofill = doc?.autofill_fields || {};
    mergeSource(extracted);
    mergeSource(autofill);
  });

  const dataset = {};
  Object.entries(source).forEach(([key, value]) => {
    const canonical = canonicalizeKey(key) || key;
    const text = toText(value);
    if (!text) return;
    if (!dataset[canonical]) dataset[canonical] = text;
    if (!dataset[key]) dataset[key] = text;
  });

  if (!dataset.name && dataset.applicant_name) dataset.name = dataset.applicant_name;
  if (!dataset.date_of_birth && dataset.dob) dataset.date_of_birth = dataset.dob;
  if (!dataset.aadhaar_number && (dataset.aadhaar || dataset.uid)) {
    dataset.aadhaar_number = dataset.aadhaar || dataset.uid;
  }
  if (!dataset.pan_number && dataset.pan) dataset.pan_number = dataset.pan;
  if (!dataset.phone && (dataset.mobile || dataset.mobile_number)) {
    dataset.phone = dataset.mobile || dataset.mobile_number;
  }
  if (!dataset.email && dataset.email_id) dataset.email = dataset.email_id;
  if (!dataset.address && dataset.address_line_1) {
    dataset.address = [dataset.address_line_1, dataset.address_line_2].filter(Boolean).join(", ");
  }
  if (!dataset.state && dataset.location_state) dataset.state = dataset.location_state;
  if (!dataset.city && dataset.location_city) dataset.city = dataset.location_city;
  if (!dataset.pincode && (dataset.location_pincode || dataset.location_pin_code)) {
    dataset.pincode = dataset.location_pincode || dataset.location_pin_code;
  }
  if (!dataset.verification_type) dataset.verification_type = "aadhaar";
  return dataset;
};

const runStepAutofill = async ({
  fields,
  dataset,
  documents,
  requiredDocs = [],
  actions,
  missingDocuments,
  matchingInsights = [],
  lockedSelectors = new Set(),
}) => {
  for (const field of fields) {
    if (field?.selector && lockedSelectors.has(field.selector)) continue;
    await ensureElementInView(field?.element);
    const detectedKey = detectFieldKey(field);
    const datasetMatchedKey = detectFieldKeyFromDataset(field, dataset);
    const dropdownInferredKey = inferDropdownKeyFromOptions(field);
    const keyCandidates = Array.from(
      new Set([detectedKey, datasetMatchedKey, dropdownInferredKey].map((item) => toText(item)).filter(Boolean))
    );
    const resolvedEntry = resolveDatasetEntryForField(field, dataset, keyCandidates);

    const key = toText(resolvedEntry.key) || keyCandidates[0] || "";
    const value = toText(resolvedEntry.value);
    if (!key && field.type !== "file") continue;

    if (field.type === "file") {
      const matchedDoc = resolveUploadDocument(field, documents, {
        requiredDocs,
        preferredName: field.label || field.name || field.id || "",
      });
      try {
        if (matchedDoc?.cloudinary_url) {
          await setFileInputFromUrl(field.element, matchedDoc.cloudinary_url);
          actions.push({
            type: "upload_file",
            field: field.name || field.id || field.label || "upload",
            selector: field.selector,
            file_url: matchedDoc.cloudinary_url,
            document_name: matchedDoc.document_name,
          });
          pushMatchingInsight(matchingInsights, {
            phase: "heuristic",
            action: "upload_file",
            field: formatFieldDisplayName(field),
            source_key: "document_match",
            value_preview: toText(matchedDoc?.document_name || ""),
            reason: "Matched upload field with uploaded document using label/name similarity.",
          });
        } else {
          const generatedFile = await createGeneratedUploadFile({
            field,
            dataset,
            documents,
            preferredName: field.label || field.name || field.id || "",
          });
          setFileInputFromFile(field.element, generatedFile);
          actions.push({
            type: "upload_generated_document",
            field: field.name || field.id || field.label || "upload",
            selector: field.selector,
            document_name: generatedFile.name,
            source_key: "generated_fallback",
          });
          pushMatchingInsight(matchingInsights, {
            phase: "heuristic",
            action: "upload_generated_document",
            field: formatFieldDisplayName(field),
            source_key: "generated_fallback",
            value_preview: toText(generatedFile?.name || ""),
            reason: "No matching uploaded document found, so generated fallback upload file was used.",
          });
        }
      } catch {
        missingDocuments.add(
          matchedDoc?.document_name || field.label || field.name || field.id || "file_upload"
        );
      }
      continue;
    }

    if (!value) continue;

    let filled = false;
    if (field.type === "select") {
      filled = fillSelect(field.element, value);
      if (filled) {
        const sourceKey = key || detectedKey || datasetMatchedKey || dropdownInferredKey || "";
        actions.push({
          type: "select_dropdown",
          field: field.name || field.id || key,
          selector: field.selector,
          value: toText(field.element.value),
          source_key: sourceKey,
        });
        pushMatchingInsight(matchingInsights, {
          phase: "heuristic",
          action: "select_dropdown",
          field: formatFieldDisplayName(field),
          source_key: sourceKey,
          value_preview: buildValuePreview(sourceKey, value),
          reason:
            toText(resolvedEntry?.reason) ||
            "Matched dropdown by placeholder/label and selected closest option value.",
        });
      }
    } else if (field.type === "radio") {
      filled = fillRadio(field, key, dataset);
      if (filled) {
        const sourceKey = key || detectedKey || datasetMatchedKey || "";
        actions.push({
          type: "click_radio",
          field: field.name || field.id || key,
          selector: field.selector,
          value: toText(value),
          source_key: sourceKey,
        });
        pushMatchingInsight(matchingInsights, {
          phase: "heuristic",
          action: "click_radio",
          field: formatFieldDisplayName(field),
          source_key: sourceKey,
          value_preview: buildValuePreview(sourceKey, value),
          reason:
            toText(resolvedEntry?.reason) ||
            "Matched radio field from label/placeholder and selected closest value.",
        });
      }
    } else if (field.type === "checkbox") {
      filled = fillCheckbox(field, key, dataset);
      if (filled) {
        const sourceKey = key || detectedKey || datasetMatchedKey || "";
        actions.push({
          type: "click_checkbox",
          field: field.name || field.id || key,
          selector: field.selector,
          value: toText(value),
          source_key: sourceKey,
        });
        pushMatchingInsight(matchingInsights, {
          phase: "heuristic",
          action: "click_checkbox",
          field: formatFieldDisplayName(field),
          source_key: sourceKey,
          value_preview: buildValuePreview(sourceKey, value),
          reason:
            toText(resolvedEntry?.reason) ||
            "Matched checkbox field from label/placeholder and applied boolean intent.",
        });
      }
    } else {
      filled = fillInput(field, value);
      if (filled) {
        const sourceKey = key || detectedKey || datasetMatchedKey || "";
        actions.push({
          type: "fill_input",
          field: field.name || field.id || key,
          selector: field.selector,
          value: toText(field.element.value),
          source_key: sourceKey,
        });
        pushMatchingInsight(matchingInsights, {
          phase: "heuristic",
          action: "fill_input",
          field: formatFieldDisplayName(field),
          source_key: sourceKey,
          value_preview: buildValuePreview(sourceKey, value),
          reason:
            toText(resolvedEntry?.reason) ||
            "Matched input using placeholder/label/name/id and dataset key aliases.",
        });
      }
    }
  }
};

const uniqueFieldSchema = (schemas) => {
  const seen = new Set();
  const out = [];
  schemas.forEach((field) => {
    const signature = normalize(`${field.selector}|${field.label}|${field.type}`);
    if (!signature || seen.has(signature)) return;
    seen.add(signature);
    out.push(field);
  });
  return out;
};

const queryBySelector = (selector) => {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
};

const toRuntimeFieldFromElement = (element, selectorOverride = "") => {
  if (!element) return null;
  const localFallbackIndex = element.getAttribute("data-gov-assist-index") || "";
  const nativePlaceholder = getNativePlaceholderText(element);
  const resolvedPlaceholder = nativePlaceholder || getPlaceholderText(element);
  return {
    element,
    descriptor: getDescriptor(element),
    placeholder: resolvedPlaceholder,
    placeholder_source: nativePlaceholder ? "native" : resolvedPlaceholder ? "derived_context" : "",
    label:
      toText(getLabelText(element)) ||
      resolvedPlaceholder ||
      toText(element.getAttribute("name")) ||
      toText(element.getAttribute("id")),
    type: inferType(element),
    tag: normalize(element.tagName),
    name: toText(element.getAttribute("name")),
    id: toText(element.getAttribute("id")),
    required: isRequiredField(element),
    selector: selectorOverride || resolveSelector(element, localFallbackIndex),
    options: extractOptions(element),
  };
};

const resolveRequiredDocsFromEnvelope = (envelope = {}) => {
  const fromScheme = Array.isArray(envelope?.payload?.scheme?.documents_required)
    ? envelope.payload.scheme.documents_required
    : [];
  const fromPlan = Array.isArray(
    envelope?.payload?.automation_preview?.backend_plan?.missing_required_documents
  )
    ? envelope.payload.automation_preview.backend_plan.missing_required_documents
    : [];
  return Array.from(
    new Set(
      [...fromScheme, ...fromPlan]
        .map((item) => toText(item))
        .filter(Boolean)
    )
  );
};

const toFormFieldSchema = (field) => ({
  label: toText(field?.label),
  name: toText(field?.name),
  id: toText(field?.id),
  selector: toText(field?.selector),
  type: toText(field?.type || "text"),
  placeholder: toText(field?.placeholder || field?.element?.placeholder || field?.element?.getAttribute("placeholder") || ""),
  required: Boolean(field?.required),
  options: Array.isArray(field?.options) ? field.options : [],
});

const requestBackendAutofillPlan = async ({ envelope, fields }) => {
  const formFields = Array.isArray(fields) ? fields.map(toFormFieldSchema) : [];
  if (formFields.length === 0) return null;

  const payload = {
    type: "BUILD_AUTOFILL_PLAN",
    page_url: window.location.href,
    form_structure: {
      fields: formFields,
    },
    scheme_data: envelope?.payload?.scheme || {},
    user_data: envelope?.payload?.user_data || {},
    profile_data: envelope?.payload?.profile_data || {},
    user_profile: envelope?.payload?.user_profile || {},
    documents: Array.isArray(envelope?.payload?.documents) ? envelope.payload.documents : [],
  };

  const response = await runtimeSendMessage(payload);
  if (!response?.ok) return null;
  return response;
};

const scoreActionFieldMatch = (field, actionField) => {
  const token = normalize(actionField);
  if (!token) return 0;
  const label = normalize(field?.label || "");
  const name = normalize(field?.name || "");
  const id = normalize(field?.id || "");
  const placeholder = normalize(field?.placeholder || "");
  const descriptor = normalize(
    `${label} ${placeholder} ${name} ${id} ${field?.selector || ""} ${field?.descriptor || ""}`
  );
  if (!descriptor) return 0;
  let score = 0;
  if (descriptor === token) score += 12;
  if (label === token || name === token || id === token) score += 11;
  if (placeholder === token) score += 10;
  if (label.includes(token) || name.includes(token) || id.includes(token)) score += 8;
  if (placeholder.includes(token)) score += 7;
  if (descriptor.includes(token) || token.includes(descriptor)) score += 6;
  score += token
    .split(" ")
    .filter(Boolean)
    .filter((word) => descriptor.includes(word)).length;
  return score;
};

const isActionTypeCompatible = (fieldType, actionType) => {
  const type = normalize(fieldType);
  const action = normalizeActionType(actionType);
  if (!type || !action) return true;

  if (action === "upload_file") return type === "file";
  if (action === "select_dropdown") return type === "select";
  if (action === "fill_input") return !["file", "radio", "checkbox", "select"].includes(type);
  if (action === "click") return ["radio", "checkbox", "button", "submit"].includes(type) || type === "text";
  return true;
};

const findFieldByAction = (fields = [], action = {}) => {
  const preferredType = normalizeActionType(action?.type || action?.action);
  const actionField = toText(action?.field || action?.name || "");

  let best = null;
  let bestScore = 0;
  for (const field of fields) {
    if (!field?.element || !isVisible(field.element)) continue;
    if (!isActionTypeCompatible(field.type, preferredType)) continue;
    const score = scoreActionFieldMatch(field, actionField);
    if (score > bestScore) {
      bestScore = score;
      best = field;
    }
  }
  const minScore = preferredType === "upload_file" ? 3 : 4;
  return bestScore >= minScore ? best : null;
};

const resolvePlannedTarget = (action, fields = []) => {
  const selector = toText(action?.selector);
  const bySelector = queryBySelector(selector);
  if (bySelector && isVisible(bySelector)) {
    return {
      element: bySelector,
      selector,
    };
  }

  const matchedField = findFieldByAction(fields, action);
  if (!matchedField?.element) return null;
  return {
    element: matchedField.element,
    selector: matchedField.selector || "",
  };
};

const applyPlannedActions = async ({
  envelope,
  fields,
  dataset,
  documents = [],
  requiredDocs = [],
  actions,
  missingDocuments,
  matchingInsights = [],
  touchedSelectors = new Set(),
}) => {
  const planned = Array.isArray(envelope?.payload?.automation_preview?.actions)
    ? envelope.payload.automation_preview.actions
    : [];
  if (planned.length === 0) return 0;

  let appliedCount = 0;
  for (const action of planned) {
    const type = normalizeActionType(action?.type || action?.action);
    if (!type) continue;

    const target = resolvePlannedTarget(action, fields);
    if (!target?.element) continue;
    let element = target.element;
    let selector = target.selector || "";
    await ensureElementInView(element);

    if (type === "fill_input") {
      const filled = fillInput(
        {
          element,
          type: inferType(element),
        },
        action.value
      );
      if (filled) {
        appliedCount += 1;
        if (selector) touchedSelectors.add(selector);
        actions.push({
          type: "fill_input",
          field: action.field || element.getAttribute("name") || element.getAttribute("id") || "",
          selector,
          value: toText(action.value),
          source_key: "planned_action",
        });
        pushMatchingInsight(matchingInsights, {
          phase: "backend_plan",
          action: "fill_input",
          field: toText(action.field || element.getAttribute("name") || element.getAttribute("id") || ""),
          source_key: "planned_action",
          value_preview: buildValuePreview(toText(action.field || ""), action.value),
          reason: "Applied backend AI mapping plan using planned selector/field mapping.",
        });
      }
      continue;
    }

    if (type === "select_dropdown") {
      const selected = fillSelect(element, action.value);
      if (selected) {
        appliedCount += 1;
        if (selector) touchedSelectors.add(selector);
        actions.push({
          type: "select_dropdown",
          field: action.field || element.getAttribute("name") || element.getAttribute("id") || "",
          selector,
          value: toText(action.value),
          source_key: "planned_action",
        });
        pushMatchingInsight(matchingInsights, {
          phase: "backend_plan",
          action: "select_dropdown",
          field: toText(action.field || element.getAttribute("name") || element.getAttribute("id") || ""),
          source_key: "planned_action",
          value_preview: buildValuePreview(toText(action.field || ""), action.value),
          reason: "Applied backend AI plan and selected nearest dropdown option.",
        });
      }
      continue;
    }

    if (type === "click") {
      element.click();
      fireFieldEvents(element);
      appliedCount += 1;
      if (selector) touchedSelectors.add(selector);
      actions.push({
        type: "click",
        field: action.field || element.getAttribute("name") || element.getAttribute("id") || "",
        selector,
        value: toText(action.value),
        source_key: "planned_action",
      });
      pushMatchingInsight(matchingInsights, {
        phase: "backend_plan",
        action: "click",
        field: toText(action.field || element.getAttribute("name") || element.getAttribute("id") || ""),
        source_key: "planned_action",
        value_preview: buildValuePreview(toText(action.field || ""), action.value),
        reason: "Applied backend AI planned click action.",
      });
      continue;
    }

    if (type === "upload_file") {
      let runtimeField =
        fields.find((field) => field?.element === element || (selector && field?.selector === selector)) ||
        null;

      if (!runtimeField || runtimeField.type !== "file") {
        const uploadField = findFieldByAction(fields, {
          ...action,
          type: "upload_file",
        });
        if (uploadField?.element) {
          runtimeField = uploadField;
          element = uploadField.element;
          selector = uploadField.selector || selector;
        } else if (inferType(element) === "file") {
          runtimeField = toRuntimeFieldFromElement(element, selector);
        } else {
          runtimeField = null;
        }
      }

      if (!runtimeField?.element || runtimeField.type !== "file") {
        continue;
      }

      const preferredName = toText(action.document_name || action.field || runtimeField.label);
      let uploaded = false;
      try {
        const plannedUrl = toText(action.file_url);
        if (plannedUrl) {
          await setFileInputFromUrl(runtimeField.element, plannedUrl);
          appliedCount += 1;
          uploaded = true;
          if (selector) touchedSelectors.add(selector);
          actions.push({
            type: "upload_file",
            field:
              action.field ||
              runtimeField.element.getAttribute("name") ||
              runtimeField.element.getAttribute("id") ||
              "",
            selector,
            file_url: plannedUrl,
            document_name: preferredName,
            source_key: "planned_action",
          });
          pushMatchingInsight(matchingInsights, {
            phase: "backend_plan",
            action: "upload_file",
            field: toText(action.field || runtimeField?.label || "upload"),
            source_key: "planned_action",
            value_preview: toText(preferredName || ""),
            reason: "Used backend AI planned file URL for upload.",
          });
        }

        if (!uploaded) {
          const matchedDoc = resolveUploadDocument(runtimeField, documents, {
            requiredDocs,
            preferredName,
          });
          if (matchedDoc?.cloudinary_url) {
            await setFileInputFromUrl(runtimeField.element, matchedDoc.cloudinary_url);
            appliedCount += 1;
            uploaded = true;
            if (selector) touchedSelectors.add(selector);
            actions.push({
              type: "upload_file",
              field:
                action.field ||
                runtimeField.element.getAttribute("name") ||
                runtimeField.element.getAttribute("id") ||
                "",
              selector,
              file_url: matchedDoc.cloudinary_url,
              document_name: toText(matchedDoc.document_name || preferredName),
              source_key: "planned_action_document_fallback",
            });
            pushMatchingInsight(matchingInsights, {
              phase: "backend_plan",
              action: "upload_file",
              field: toText(action.field || runtimeField?.label || "upload"),
              source_key: "planned_action_document_fallback",
              value_preview: toText(matchedDoc?.document_name || preferredName || ""),
              reason: "Planned upload resolved using best matching uploaded document.",
            });
          }
        }

        if (!uploaded) {
          const generatedFile = await createGeneratedUploadFile({
            field: runtimeField,
            dataset,
            documents,
            preferredName,
          });
          setFileInputFromFile(runtimeField.element, generatedFile);
          appliedCount += 1;
          uploaded = true;
          if (selector) touchedSelectors.add(selector);
          actions.push({
            type: "upload_generated_document",
            field:
              action.field ||
              runtimeField.element.getAttribute("name") ||
              runtimeField.element.getAttribute("id") ||
              "upload",
            selector,
            document_name: generatedFile.name,
            source_key: "planned_action_generated_fallback",
          });
          pushMatchingInsight(matchingInsights, {
            phase: "backend_plan",
            action: "upload_generated_document",
            field: toText(action.field || runtimeField?.label || "upload"),
            source_key: "planned_action_generated_fallback",
            value_preview: toText(generatedFile?.name || ""),
            reason: "No uploaded document matched planned upload, so generated fallback file was used.",
          });
        }
      } catch {
        missingDocuments.add(preferredName || "upload");
      }
    }
  }

  return appliedCount;
};

const runAutofillWorkflow = async (envelope, { allowMultiStep = true } = {}) => {
  let workingEnvelope = envelope;
  const dataset = buildDataset(workingEnvelope);
  const documents = Array.isArray(workingEnvelope?.payload?.documents)
    ? workingEnvelope.payload.documents.filter((doc) => toText(doc?.cloudinary_url))
    : [];
  const requiredDocs = resolveRequiredDocsFromEnvelope(workingEnvelope);
  const actions = [];
  const allSchemas = [];
  const stepSummary = [];
  const matchingInsights = [];
  const missingDocuments = new Set();
  const visitedNextButtons = new Set();
  const touchedSelectors = new Set();
  const backendPlanState = {
    used: false,
    action_count: 0,
    missing_profile_fields: [],
    missing_required_documents: [],
    assistant_hints: [],
  };

  for (let step = 1; step <= MAX_MULTI_STEP; step += 1) {
    await autoScrollForDynamicContent();
    const fields = collectFields();

    fields.forEach((field) => {
      allSchemas.push({
        label: field.label,
        type: field.type,
        name: field.name || field.id || "",
        id: field.id || "",
        placeholder: field.placeholder || "",
        placeholder_source: field.placeholder_source || "",
        selector: field.selector,
        required: field.required,
      });
    });

    const authCaptcha = detectAuthOrCaptcha(fields);
    if (step === 1) {
      const backendPlan = await requestBackendAutofillPlan({
        envelope: workingEnvelope,
        fields,
      });
      if (backendPlan?.ok && Array.isArray(backendPlan.actions) && backendPlan.actions.length > 0) {
        backendPlanState.used = true;
        backendPlanState.action_count = backendPlan.actions.length;
        backendPlanState.missing_profile_fields = Array.isArray(backendPlan.missing_profile_fields)
          ? backendPlan.missing_profile_fields
          : [];
        backendPlanState.missing_required_documents = Array.isArray(
          backendPlan.missing_required_documents
        )
          ? backendPlan.missing_required_documents
          : [];
        backendPlanState.assistant_hints = Array.isArray(backendPlan?.plan?.assistant_hints)
          ? backendPlan.plan.assistant_hints
          : [];
        backendPlanState.missing_required_documents.forEach((item) => missingDocuments.add(item));

        workingEnvelope = {
          ...workingEnvelope,
          payload: {
            ...(workingEnvelope.payload || {}),
            automation_preview: {
              ...(workingEnvelope.payload?.automation_preview || {}),
              actions: backendPlan.actions,
              backend_plan: backendPlan.plan || {},
            },
          },
        };
      }

      await applyPlannedActions({
        envelope: workingEnvelope,
        fields,
        dataset,
        documents,
        requiredDocs,
        actions,
        missingDocuments,
        matchingInsights,
        touchedSelectors,
      });
    }
    await runStepAutofill({
      fields,
      dataset,
      documents,
      requiredDocs,
      actions,
      missingDocuments,
      matchingInsights,
      lockedSelectors: touchedSelectors,
    });

    const missingFields = validateRequiredFields(fields);
    stepSummary.push({
      step,
      fields_detected: fields.length,
      required_missing: missingFields.length,
      auth_detected: authCaptcha.authDetected,
      captcha_detected: authCaptcha.captchaDetected,
      backend_plan_applied: step === 1 ? backendPlanState.used : false,
    });

    if (!allowMultiStep) break;

    const nextButton = findNextButton(visitedNextButtons);
    if (!nextButton) break;
    nextButton.node.click();
    actions.push({
      type: "click_next",
      field: "next",
      value: nextButton.text,
    });
    await sleep(1200);
  }

  const finalFields = collectFields();
  const validationMissing = validateRequiredFields(finalFields);
  const flags = detectAuthOrCaptcha(finalFields);
  const uniqueSchemas = uniqueFieldSchema(allSchemas);
  const nativePlaceholderFields = uniqueSchemas.filter((field) => field?.placeholder_source === "native").length;
  const derivedPlaceholderFields = uniqueSchemas.filter(
    (field) => field?.placeholder_source === "derived_context"
  ).length;
  const fieldsWithPlaceholder = nativePlaceholderFields + derivedPlaceholderFields;
  const assistantRecommendations = [];
  if (backendPlanState.used) {
    assistantRecommendations.push(
      `AI mapping plan applied with ${backendPlanState.action_count} step(s).`
    );
  } else {
    assistantRecommendations.push("AI mapping plan unavailable. Heuristic autofill was used.");
  }
  backendPlanState.assistant_hints.forEach((hint) => assistantRecommendations.push(toText(hint)));
  if (backendPlanState.missing_profile_fields.length > 0) {
    assistantRecommendations.push(
      `Missing profile values: ${backendPlanState.missing_profile_fields.join(", ")}.`
    );
  }
  if (validationMissing.length > 0) {
    assistantRecommendations.push(
      `Review required fields manually: ${validationMissing.slice(0, 8).join(", ")}.`
    );
  }
  if (flags.captchaDetected) {
    assistantRecommendations.push("Captcha must be solved manually by the user.");
  }
  if (flags.authDetected) {
    assistantRecommendations.push("Login/authentication steps must be completed manually.");
  }

  actions.push({
    type: "review_before_submit",
    field: "form_review",
    value: "User must verify all fields before manually submitting.",
  });

  return {
    ok: true,
    page_url: window.location.href,
    detected_form_schema: {
      fields: uniqueSchemas,
    },
    actions,
    backend_plan: backendPlanState,
    ai_assistant: {
      enabled: true,
      recommendations: assistantRecommendations,
    },
    step_summary: stepSummary,
    matching_insights: matchingInsights,
    placeholder_crawl: {
      total_fields_scanned: uniqueSchemas.length,
      fields_with_placeholder: fieldsWithPlaceholder,
      native_placeholder_fields: nativePlaceholderFields,
      derived_placeholder_fields: derivedPlaceholderFields,
      coverage: uniqueSchemas.length > 0 ? Number((fieldsWithPlaceholder / uniqueSchemas.length).toFixed(2)) : 0,
    },
    missing_required_fields: validationMissing,
    missing_required_documents: Array.from(missingDocuments),
    constraints: {
      authentication_manual: flags.authDetected,
      captcha_manual: flags.captchaDetected,
      user_review_required: true,
    },
  };
};

const ensureResultPanel = () => {
  let panel = document.getElementById(RESULT_PANEL_ID);
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = RESULT_PANEL_ID;
  panel.style.position = "fixed";
  panel.style.right = "16px";
  panel.style.bottom = "78px";
  panel.style.width = "360px";
  panel.style.maxHeight = "56vh";
  panel.style.overflow = "auto";
  panel.style.background = "#ffffff";
  panel.style.border = "1px solid #dbe2ea";
  panel.style.borderRadius = "12px";
  panel.style.boxShadow = "0 10px 24px rgba(15, 23, 42, 0.16)";
  panel.style.padding = "10px";
  panel.style.fontFamily = "Arial, sans-serif";
  panel.style.fontSize = "12px";
  panel.style.zIndex = "2147483646";
  panel.style.display = "none";
  document.body.appendChild(panel);
  return panel;
};

const showResultPanel = (result) => {
  const panel = ensureResultPanel();
  const safeResult = result || {};
  const missingFields = Array.isArray(safeResult.missing_required_fields)
    ? safeResult.missing_required_fields
    : [];
  const missingDocs = Array.isArray(safeResult.missing_required_documents)
    ? safeResult.missing_required_documents
    : [];
  const actionCount = Array.isArray(safeResult.actions) ? safeResult.actions.length : 0;
  const matchingInsights = Array.isArray(safeResult.matching_insights)
    ? safeResult.matching_insights
    : [];
  const placeholderStats =
    safeResult?.placeholder_crawl && typeof safeResult.placeholder_crawl === "object"
      ? safeResult.placeholder_crawl
      : {};
  const assistantRecs = Array.isArray(safeResult?.ai_assistant?.recommendations)
    ? safeResult.ai_assistant.recommendations
    : [];

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <strong style="font-size:13px;color:#0f172a;">Gov Assist Autofill Result</strong>
      <button id="__gov_assist_close_panel" style="border:0;background:#f1f5f9;color:#334155;border-radius:6px;padding:2px 7px;cursor:pointer;">x</button>
    </div>
    <p style="margin:8px 0 0;color:#334155;">Actions: <b>${actionCount}</b></p>
    <p style="margin:6px 0 0;color:${missingFields.length ? "#b45309" : "#166534"};">
      Missing required fields: <b>${missingFields.length}</b>
    </p>
    <p style="margin:6px 0 0;color:${missingDocs.length ? "#b45309" : "#166534"};">
      Missing documents: <b>${missingDocs.length}</b>
    </p>
    <p style="margin:6px 0 0;color:#334155;">
      Placeholder crawl: <b>${Number(placeholderStats.fields_with_placeholder || 0)}</b> /
      <b>${Number(placeholderStats.total_fields_scanned || 0)}</b>
    </p>
    <p style="margin:4px 0 0;color:#64748b;">
      Native: <b>${Number(placeholderStats.native_placeholder_fields || 0)}</b> |
      Derived: <b>${Number(placeholderStats.derived_placeholder_fields || 0)}</b>
    </p>
    ${
      matchingInsights.length > 0
        ? `<details style="margin-top:8px;">
      <summary style="cursor:pointer;color:#1d4ed8;">Matching decisions (${matchingInsights.length})</summary>
      <ul style="margin:8px 0 0 16px;padding:0;color:#334155;">
        ${matchingInsights
          .slice(0, 12)
          .map((item) => {
            const field = toText(item?.field || "field");
            const source = toText(item?.source_key || "");
            const reason = toText(item?.reason || "");
            const valuePreview = toText(item?.value_preview || "");
            return `<li style="margin:4px 0;">
              <div><b>${field}</b>${source ? ` <- ${source}` : ""}${valuePreview ? ` = ${valuePreview}` : ""}</div>
              ${reason ? `<div style="color:#64748b;">${reason}</div>` : ""}
            </li>`;
          })
          .join("")}
      </ul>
      ${
        matchingInsights.length > 12
          ? `<p style="margin:8px 0 0;color:#64748b;">Showing first 12 of ${matchingInsights.length} matching decisions.</p>`
          : ""
      }
    </details>`
        : ""
    }
    ${
      assistantRecs.length > 0
        ? `<details style="margin-top:8px;">
      <summary style="cursor:pointer;color:#1d4ed8;">AI Assistant Notes</summary>
      <ul style="margin:8px 0 0 16px;padding:0;color:#334155;">
        ${assistantRecs.map((item) => `<li style="margin:4px 0;">${toText(item)}</li>`).join("")}
      </ul>
    </details>`
        : ""
    }
    <details style="margin-top:8px;">
      <summary style="cursor:pointer;color:#1d4ed8;">View automation plan JSON</summary>
      <pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-top:8px;max-height:220px;overflow:auto;">${toText(
        JSON.stringify(safeResult, null, 2)
      )}</pre>
    </details>
  `;

  panel.style.display = "block";
  const closeBtn = panel.querySelector("#__gov_assist_close_panel");
  closeBtn?.addEventListener("click", () => {
    panel.style.display = "none";
  });
};

const showToast = (message, tone = "success") => {
  const existing = document.getElementById("__gov_assist_toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "__gov_assist_toast";
  toast.style.position = "fixed";
  toast.style.right = "16px";
  toast.style.top = "16px";
  toast.style.zIndex = "2147483647";
  toast.style.fontFamily = "Arial, sans-serif";
  toast.style.fontSize = "13px";
  toast.style.padding = "10px 14px";
  toast.style.borderRadius = "10px";
  toast.style.boxShadow = "0 10px 20px rgba(15, 23, 42, 0.18)";
  toast.style.color = tone === "error" ? "#7f1d1d" : "#14532d";
  toast.style.background = tone === "error" ? "#fee2e2" : "#dcfce7";
  toast.style.border = tone === "error" ? "1px solid #fecaca" : "1px solid #bbf7d0";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2800);
};

const fetchStoredContext = async () => {
  const response = await runtimeSendMessage({ type: "GET_AUTOFILL_CONTEXT" });
  if (!response?.ok || !response?.envelope) return null;
  return response.envelope;
};

const readContextFromPageStorage = () => {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.source !== CONTEXT_SOURCE || parsed.type !== CONTEXT_TYPE) return null;
    return parsed;
  } catch {
    return null;
  }
};

const runWithEnvelope = async (envelope, source) => {
  if (autofillRunning) {
    return {
      ok: false,
      error: "Autofill already running",
    };
  }
  autofillRunning = true;

  try {
    const extractedKeys = Object.keys(buildDataset(envelope));
    console.info("[GovAssist] Autofill started", {
      source,
      page_url: window.location.href,
      extracted_keys: extractedKeys,
      documents: Array.isArray(envelope?.payload?.documents) ? envelope.payload.documents.length : 0,
    });

    const result = await runAutofillWorkflow(envelope, { allowMultiStep: true });
    console.info("[GovAssist] Autofill result", {
      ok: result?.ok,
      actions: Array.isArray(result?.actions) ? result.actions.length : 0,
      missing_required_fields: result?.missing_required_fields || [],
      missing_required_documents: result?.missing_required_documents || [],
      backend_plan: result?.backend_plan || {},
    });

    await runtimeSendMessage({
      type: "STORE_LAST_AUTOFILL_RESULT",
      result: {
        ...result,
        source,
        executed_at: new Date().toISOString(),
      },
    });
    showResultPanel(result);
    if (result.missing_required_fields.length > 0 || result.missing_required_documents.length > 0) {
      showToast("Autofill completed with some missing fields/documents. Review required.", "error");
    } else {
      showToast(`Autofill completed. ${result.actions.length} action(s) prepared/applied.`, "success");
    }
    return result;
  } catch (error) {
    const failed = {
      ok: false,
      error: error?.message || "Autofill failed",
      source,
      executed_at: new Date().toISOString(),
    };
    await runtimeSendMessage({
      type: "STORE_LAST_AUTOFILL_RESULT",
      result: failed,
    });
    showToast(failed.error, "error");
    return failed;
  } finally {
    autofillRunning = false;
  }
};

const shouldInjectButton = () => {
  const host = normalize(window.location.hostname);
  if (!host) return true;
  return host !== "localhost" && host !== "127.0.0.1";
};

const injectFloatingButton = () => {
  if (document.getElementById(FLOATING_BUTTON_ID)) return;

  const button = document.createElement("button");
  button.id = FLOATING_BUTTON_ID;
  button.type = "button";
  button.textContent = "Auto Fill Scheme Form";
  button.style.position = "fixed";
  button.style.right = "16px";
  button.style.bottom = "16px";
  button.style.zIndex = "2147483647";
  button.style.border = "0";
  button.style.borderRadius = "999px";
  button.style.background = "#1d4ed8";
  button.style.color = "#ffffff";
  button.style.fontFamily = "Arial, sans-serif";
  button.style.fontSize = "13px";
  button.style.fontWeight = "700";
  button.style.padding = "11px 15px";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 12px 24px rgba(29, 78, 216, 0.35)";

  button.addEventListener("click", async () => {
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "Filling...";
    const envelope = await fetchStoredContext();
    if (!envelope) {
      showToast("No context available. Open Gov Assist app, login, then retry.", "error");
      button.textContent = oldText;
      button.disabled = false;
      return;
    }
    await runWithEnvelope(envelope, "floating_button");
    button.textContent = oldText;
    button.disabled = false;
  });

  document.body.appendChild(button);
};

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== CONTEXT_SOURCE || data.type !== CONTEXT_TYPE) return;
  await runtimeSendMessage({
    type: "STORE_AUTOFILL_CONTEXT",
    envelope: data,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = normalize(message?.type);
  if (type === "get_context_from_page") {
    const envelope = readContextFromPageStorage();
    sendResponse({
      ok: Boolean(envelope),
      envelope,
    });
    return false;
  }

  if (type !== "run_autofill_from_context") {
    sendResponse({ ok: false, error: "Unsupported content message type" });
    return false;
  }

  (async () => {
    const envelope = message?.envelope || (await fetchStoredContext());
    if (!envelope) {
      sendResponse({ ok: false, error: "No autofill context available." });
      return;
    }
    const result = await runWithEnvelope(envelope, "background_trigger");
    sendResponse(result);
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error?.message || "Autofill failed",
    });
  });

  return true;
});

if (shouldInjectButton()) {
  injectFloatingButton();
}
