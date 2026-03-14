const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const FIELD_SYNONYMS = {
  name: [
    "full name",
    "name",
    "applicant name",
    "candidate name",
    "beneficiary name",
    "subscriber name",
  ],
  date_of_birth: ["date of birth", "dob", "birth date", "applicant dob", "subscriber date of birth"],
  age: ["age", "applicant age"],
  gender: ["gender", "sex"],
  occupation: ["occupation", "profession", "employment type"],
  income: ["income", "annual income", "family income", "household income"],
  state: ["state", "state of residence"],
  category: ["category", "caste category", "social category"],
  father_name: ["father name", "father's name", "s/o", "d/o", "son of", "daughter of"],
  husband_name: ["husband name", "husband's name", "spouse name", "w/o", "wife of"],
  guardian_name: ["guardian name", "guardian's name", "care of", "c/o", "parent name"],
  aadhaar_number: [
    "aadhaar",
    "aadhar",
    "aadhaar number",
    "uid number",
    "subscriber aadhaar",
    "aadhaar vid",
  ],
  eshram_uan: ["e-shram uan", "eshram uan", "uan number", "e shram number", "subscriber uan number"],
  vid_number: ["vid", "virtual id", "aadhaar vid"],
  pan_number: ["pan", "pan number", "permanent account number"],
  bank_account: ["bank account", "account number", "bank a c no"],
  ifsc_code: ["ifsc", "ifsc code", "bank ifsc"],
  email: ["email", "email id", "e-mail"],
  phone: ["phone", "mobile", "mobile number", "contact number", "subscriber mobile number"],
  pincode: ["pincode", "pin code", "postal code", "zip code"],
  district: ["district", "city", "town"],
  north_eastern_region: [
    "north eastern region",
    "north east region",
    "belong to north eastern region",
    "north eastern",
  ],
  income_tax_payer: ["income tax payer", "income taxpayer", "tax payer", "taxpayer"],
  nps_member: [
    "member beneficiary of nps esic epfo",
    "nps",
    "esic",
    "epfo",
    "nps esic epfo",
  ],
  consent_authentication: [
    "consent for authentication",
    "authentication consent",
    "i hereby give my consent",
    "consent",
  ],
  address: ["address", "residential address", "permanent address", "communication address"],
  verification_type: ["verification type", "aadhaar", "vid"],
  password: ["password", "portal password", "login password"],
  confirm_password: ["confirm password", "re-enter password", "repeat password"],
};

const SOURCE_KEY_ALIASES = {
  email_id: "email",
  mail_id: "email",
  mobile_number: "phone",
  contact_number: "phone",
  father_s_name: "father_name",
  spouse_name: "husband_name",
  care_of: "guardian_name",
  c_o: "guardian_name",
  aadhaar: "aadhaar_number",
  aadhar: "aadhaar_number",
  pan: "pan_number",
  account_number: "bank_account",
  ifsc: "ifsc_code",
  pin_code: "pincode",
  postal_code: "pincode",
  north_east_region: "north_eastern_region",
  nps_esic_epfo_member: "nps_member",
  nps_member_beneficiary: "nps_member",
  consent: "consent_authentication",
  tax_payer: "income_tax_payer",
};

const canonicalKeys = Object.keys(FIELD_SYNONYMS);
const SENSITIVE_SOURCE_KEYS = new Set([
  "date_of_birth",
  "aadhaar_number",
  "eshram_uan",
  "vid_number",
  "pan_number",
  "bank_account",
  "ifsc_code",
  "email",
  "phone",
  "pincode",
]);

const STRICT_INTENT_HINTS = {
  date_of_birth: ["date of birth", "dob", "birth date"],
  aadhaar_number: ["aadhaar", "aadhar", "uid"],
  eshram_uan: ["e shram", "eshram", "uan"],
  vid_number: ["vid", "virtual id"],
  pan_number: ["pan", "permanent account number"],
  email: ["email", "e-mail", "mail id"],
  phone: ["mobile", "phone", "contact number"],
  pincode: ["pin code", "pincode", "postal code", "zip code"],
  ifsc_code: ["ifsc"],
  bank_account: ["account number", "bank account"],
  age: ["age"],
  income: ["income", "annual income", "family income"],
};

const digitsOnly = (value) => String(value ?? "").replace(/\D+/g, "");

const isLikelyDate = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) return true;
  const parsed = new Date(text);
  return !Number.isNaN(parsed.getTime());
};

const isLikelyEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());

const isValueCompatibleWithSourceKey = (sourceKey = "", value = "") => {
  const key = normalizeKey(SOURCE_KEY_ALIASES[normalizeKey(sourceKey)] || sourceKey);
  const text = String(value ?? "").trim();
  if (!key || !text) return false;

  if (key === "date_of_birth") return isLikelyDate(text);
  if (key === "aadhaar_number") return digitsOnly(text).length === 12;
  if (key === "eshram_uan") return digitsOnly(text).length >= 12;
  if (key === "vid_number") return digitsOnly(text).length >= 16;
  if (key === "pan_number") return /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(text);
  if (key === "phone") {
    const digits = digitsOnly(text);
    return digits.length >= 10 && digits.length <= 13;
  }
  if (key === "pincode") return digitsOnly(text).length === 6;
  if (key === "email") return isLikelyEmail(text);
  if (key === "ifsc_code") return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(text);
  if (key === "bank_account") {
    const digits = digitsOnly(text);
    return digits.length >= 8 && digits.length <= 20;
  }
  if (key === "age") {
    const num = Number(text);
    return Number.isFinite(num) && num >= 0 && num <= 120;
  }
  if (key === "income") {
    const numeric = Number(text.replace(/[, ]+/g, ""));
    return Number.isFinite(numeric) && numeric >= 0;
  }
  if (key === "verification_type") return ["aadhaar", "aadhar", "vid", "virtual id"].includes(normalize(text));
  return true;
};

const detectStrongDescriptorIntent = (descriptorText = "") => {
  const descriptor = normalize(descriptorText);
  if (!descriptor) return "";

  let bestKey = "";
  let bestHits = 0;
  Object.entries(STRICT_INTENT_HINTS).forEach(([key, tokens]) => {
    const hits = (tokens || []).filter((token) => descriptor.includes(normalize(token))).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestKey = key;
    }
  });

  return bestHits > 0 ? bestKey : "";
};

const isLikelyDescriptorKeyConflict = (descriptorText = "", sourceKey = "") => {
  const descriptorIntent = detectStrongDescriptorIntent(descriptorText);
  if (!descriptorIntent) return false;
  const resolvedKey = normalizeKey(SOURCE_KEY_ALIASES[normalizeKey(sourceKey)] || sourceKey);
  return Boolean(resolvedKey) && descriptorIntent !== resolvedKey;
};

const scoreMatch = (fieldText, key) => {
  const text = normalize(fieldText);
  if (!text) return 0;
  let score = 0;
  for (const synonym of FIELD_SYNONYMS[key] || []) {
    const token = normalize(synonym);
    if (!token) continue;
    if (text === token) score += 12;
    if (text.includes(token)) score += 6;
    if (token.includes(text) && text.length > 2) score += 3;
  }
  return score;
};

const detectCanonicalField = (field) => {
  const descriptor = normalize(
    `${field.label || ""} ${field.name || ""} ${field.id || ""} ${field.placeholder || ""}`
  );
  let bestKey = "";
  let bestScore = 0;
  canonicalKeys.forEach((key) => {
    const score = scoreMatch(descriptor, key);
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  });
  return {
    key: bestScore >= 6 ? bestKey : "",
    score: bestScore,
  };
};

const resolveSelector = (field) => {
  if (field?.selector) return String(field.selector).trim();
  if (field.id) return `#${field.id}`;
  if (field.type === "radio" && field.name && field.value) {
    return `[name="${field.name}"][value="${field.value}"]`;
  }
  if (field.name) return `[name="${field.name}"]`;
  if (field["aria-label"]) return `[aria-label="${field["aria-label"]}"]`;
  if (field.placeholder) return `[placeholder="${field.placeholder}"]`;
  return "";
};

const findDropdownValue = (field, inputValue) => {
  const options = Array.isArray(field.options) ? field.options : [];
  if (options.length === 0) return inputValue;

  const target = normalize(inputValue);
  let bestOption = null;
  let bestScore = 0;

  for (const option of options) {
    const optionLabel = normalize(option.label);
    const optionValue = normalize(option.value);
    let score = 0;
    if (optionLabel === target || optionValue === target) score += 20;
    if (optionLabel.includes(target) || target.includes(optionLabel)) score += 8;
    if (optionValue.includes(target) || target.includes(optionValue)) score += 8;
    score += target
      .split(" ")
      .filter(Boolean)
      .filter((word) => optionLabel.includes(word) || optionValue.includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      bestOption = option;
    }
  }

  if (bestOption && bestScore > 0) return bestOption.value;
  return inputValue;
};

const toProfileDictionary = (profile = {}, credentials = {}) => {
  const locationState = profile?.location?.state || profile?.state || "";
  const locationDistrict = profile?.location?.district || profile?.district || "";
  const locationCity = profile?.location?.city || profile?.city || "";
  const locationPincode = profile?.location?.pincode || profile?.pincode || profile?.pin_code || "";
  const dictionary = {
    name: profile?.name || "",
    date_of_birth: profile?.date_of_birth || profile?.dob || "",
    dob: profile?.date_of_birth || profile?.dob || "",
    age: profile?.age ?? "",
    gender: profile?.gender || "",
    occupation: profile?.occupation || "",
    income: profile?.income ?? profile?.annual_income ?? "",
    annual_income: profile?.income ?? profile?.annual_income ?? "",
    state: locationState,
    category: profile?.category || "",
    aadhaar_number: profile?.aadhaar_number || "",
    aadhaar: profile?.aadhaar_number || "",
    eshram_uan: profile?.eshram_uan || profile?.uan_number || "",
    vid_number: profile?.vid_number || "",
    pan_number: profile?.pan_number || "",
    pan: profile?.pan_number || "",
    bank_account: profile?.bank_account || "",
    account_number: profile?.bank_account || "",
    ifsc_code: profile?.ifsc_code || "",
    ifsc: profile?.ifsc_code || "",
    email: profile?.email || credentials?.email || "",
    phone: profile?.phone || "",
    mobile: profile?.phone || "",
    pincode: locationPincode || "",
    city: locationCity || "",
    district: locationDistrict || "",
    father_name: profile?.father_name || profile?.father || "",
    husband_name: profile?.husband_name || profile?.spouse_name || "",
    guardian_name: profile?.guardian_name || profile?.care_of || "",
    address_line_1: profile?.address_line_1 || profile?.address1 || "",
    address_line_2: profile?.address_line_2 || profile?.address2 || "",
    north_eastern_region: profile?.north_eastern_region || profile?.north_east_region || "",
    income_tax_payer: profile?.income_tax_payer || profile?.tax_payer || "",
    nps_member: profile?.nps_member || profile?.nps_esic_epfo_member || "",
    consent_authentication:
      profile?.consent_authentication || profile?.consent || profile?.authentication_consent || "",
    address: profile?.address || "",
    applicant_name: profile?.name || "",
    verification_type: "aadhaar",
    password: credentials?.password || "",
    confirm_password: credentials?.password || "",
  };

  Object.entries(profile || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === "object") return;
    const normalized = normalizeKey(key);
    if (!normalized) return;
    const text = String(value).trim();
    if (!text) return;
    dictionary[normalized] = text;
  });

  return dictionary;
};

const detectDynamicField = (field, profileDictionary = {}) => {
  const descriptor = normalize(
    `${field.label || ""} ${field.name || ""} ${field.id || ""} ${field.placeholder || ""}`
  );
  if (!descriptor) return { key: "", score: 0 };

  let bestKey = "";
  let bestScore = 0;
  Object.keys(profileDictionary || {}).forEach((candidateKey) => {
    if (candidateKey === "password" || candidateKey === "confirm_password") return;
    const keyLabel = normalize(String(candidateKey || "").replace(/_/g, " "));
    if (!keyLabel) return;
    let score = 0;
    if (descriptor === keyLabel) score += 10;
    if (descriptor.includes(keyLabel) || keyLabel.includes(descriptor)) score += 6;
    score += keyLabel
      .split(" ")
      .filter(Boolean)
      .filter((word) => descriptor.includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      bestKey = candidateKey;
    }
  });

  return bestScore >= 6 ? { key: bestKey, score: bestScore } : { key: "", score: 0 };
};

const mergeAiSuggestions = (heuristicMappings, aiSuggestions = [], profileDictionary = {}) => {
  if (!Array.isArray(aiSuggestions) || aiSuggestions.length === 0) return heuristicMappings;
  const bySelector = new Map();
  heuristicMappings.forEach((item) => bySelector.set(item.selector, item));

  for (const suggestion of aiSuggestions) {
    const selector = String(suggestion?.selector || "").trim();
    const rawSourceKey = String(suggestion?.source_key || "").trim();
    if (!selector || !rawSourceKey) continue;
    const normalizedSourceKey = normalizeKey(rawSourceKey);
    const resolvedSourceKey = SOURCE_KEY_ALIASES[normalizedSourceKey] || normalizedSourceKey;
    if (!Object.prototype.hasOwnProperty.call(profileDictionary, resolvedSourceKey)) continue;
    const value = profileDictionary[resolvedSourceKey];
    if (value === null || value === undefined || value === "") continue;
    if (!isValueCompatibleWithSourceKey(resolvedSourceKey, value)) continue;

    const existingDescriptor = `${existing?.label || ""} ${existing?.field_name || ""} ${existing?.source_key || ""}`;
    if (existingDescriptor && isLikelyDescriptorKeyConflict(existingDescriptor, resolvedSourceKey)) {
      continue;
    }

    const existing = bySelector.get(selector);
    if (!existing || (existing.confidence ?? 0) < 0.9) {
      bySelector.set(selector, {
        ...existing,
        selector,
        source_key: resolvedSourceKey,
        value,
        confidence: Math.max(Number(suggestion?.confidence || 0), 0.9),
        detection_source: "gemini",
      });
    }
  }

  return Array.from(bySelector.values());
};

export const buildFieldMappings = ({
  forms = [],
  userProfile = {},
  portalCredentials = {},
  aiSuggestions = [],
}) => {
  const profileDictionary = toProfileDictionary(userProfile, portalCredentials);
  const mappings = [];
  const missingProfileFields = new Set();

  for (const form of forms) {
    const fields = Array.isArray(form?.fields) ? form.fields : [];
    for (const field of fields) {
      if (!field || field.type === "hidden" || field.type === "file") continue;
      const selector = resolveSelector(field);
      if (!selector) continue;

      const inferred = detectCanonicalField(field);
      const dynamic = inferred.key ? { key: "", score: 0 } : detectDynamicField(field, profileDictionary);
      const resolvedKey = inferred.key || dynamic.key;
      const resolvedScore = inferred.key ? inferred.score : dynamic.score;
      const detectionSource = inferred.key ? "heuristic" : dynamic.key ? "dynamic_profile" : "";
      if (!resolvedKey) continue;

      const value = profileDictionary[resolvedKey];
      if (value === null || value === undefined || value === "") {
        missingProfileFields.add(resolvedKey);
        continue;
      }
      const descriptorText = `${field?.label || ""} ${field?.name || ""} ${field?.id || ""} ${field?.placeholder || ""}`;
      if (isLikelyDescriptorKeyConflict(descriptorText, resolvedKey)) continue;
      if (!isValueCompatibleWithSourceKey(resolvedKey, value)) continue;
      const minScore = SENSITIVE_SOURCE_KEYS.has(resolvedKey) ? 6 : 4;
      if (resolvedScore < minScore) continue;

      let actionType = "fill_input";
      if (field.tag === "select" || field.type === "select") actionType = "select_dropdown";
      if (field.type === "radio" || field.type === "checkbox") actionType = "click";
      const mappedValue = actionType === "select_dropdown" ? findDropdownValue(field, value) : String(value);

      mappings.push({
        form_kind: form.form_kind || "unknown",
        selector,
        field_name: field.name || field.id || resolvedKey,
        label: field.label || "",
        required: Boolean(field.required),
        action_type: actionType,
        source_key: resolvedKey,
        value: mappedValue,
        confidence: Math.min(resolvedScore / 12, 1),
        detection_source: detectionSource || "heuristic",
      });
    }
  }

  const mergedMappings = mergeAiSuggestions(mappings, aiSuggestions, profileDictionary);

  return {
    mappings: mergedMappings,
    missing_profile_fields: Array.from(missingProfileFields),
  };
};
