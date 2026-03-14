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

const BASE_FIELD_SYNONYMS = {
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
    "i agree",
    "agree",
    "authorize",
    "authorise",
  ],
  address: ["address", "residential address", "permanent address", "communication address"],
  verification_type: ["verification type", "aadhaar", "vid"],
  password: ["password", "portal password", "login password"],
  confirm_password: ["confirm password", "re-enter password", "repeat password"],
};

const BASE_SOURCE_KEY_ALIASES = {
  applicant_name: "name",
  candidate_name: "name",
  beneficiary_name: "name",
  subscriber_name: "name",
  full_name: "name",
  dob: "date_of_birth",
  birth_date: "date_of_birth",
  year_of_birth: "date_of_birth",
  annual_income: "income",
  family_income: "income",
  household_income: "income",
  email_id: "email",
  mail_id: "email",
  mobile_number: "phone",
  contact_number: "phone",
  phone_number: "phone",
  father_s_name: "father_name",
  spouse_name: "husband_name",
  care_of: "guardian_name",
  c_o: "guardian_name",
  aadhaar: "aadhaar_number",
  aadhar: "aadhaar_number",
  uid: "aadhaar_number",
  uid_number: "aadhaar_number",
  pan: "pan_number",
  account_number: "bank_account",
  bank_account_number: "bank_account",
  account_no: "bank_account",
  ac_no: "bank_account",
  ifsc: "ifsc_code",
  pin_code: "pincode",
  postal_code: "pincode",
  zip_code: "pincode",
  north_east_region: "north_eastern_region",
  nps_esic_epfo_member: "nps_member",
  nps_member_beneficiary: "nps_member",
  consent: "consent_authentication",
  authentication_consent: "consent_authentication",
  consent_authentication: "consent_authentication",
  tax_payer: "income_tax_payer",
  portal_email: "email",
  login_email: "email",
  registered_email: "email",
  portal_password: "password",
};

const LOGIN_FIELD_SYNONYMS = {
  name: ["account name", "user name", "registered name", "login name"],
  email: ["account email", "registered email", "login email", "user email", "email address"],
  password: ["account password", "portal password", "login password", "user password"],
  confirm_password: ["confirm password", "re-enter password", "repeat password", "verify password"],
};

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
  consent_authentication: ["consent", "i agree", "authentication", "authorize", "authorise"],
  age: ["age"],
  income: ["income", "annual income", "family income"],
};

const STRICT_SENSITIVE_KEYS = new Set([...SENSITIVE_SOURCE_KEYS, "verification_type"]);

const CONSENT_INTENT_TOKENS = [
  "i agree",
  "agree",
  "consent",
  "hereby give my consent",
  "authorize",
  "authorise",
  "authentication",
  "validate my aadhaar",
  "validate aadhaar",
  "declaration",
  "undertaking",
  "terms and conditions",
  "terms & conditions",
];

const MASKED_SENSITIVE_KEYS = new Set([
  "aadhaar_number",
  "eshram_uan",
  "vid_number",
  "pan_number",
  "bank_account",
  "ifsc_code",
]);

const cloneSynonymMap = (input = {}) =>
  Object.fromEntries(
    Object.entries(input).map(([key, list]) => [
      normalizeKey(key),
      Array.from(
        new Set(
          (Array.isArray(list) ? list : [])
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        )
      ),
    ])
  );

const ensureSynonymBucket = (map, key) => {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return "";
  if (!Array.isArray(map[normalizedKey])) {
    map[normalizedKey] = [];
  }
  return normalizedKey;
};

const addSynonym = (map, key, value) => {
  const normalizedKey = ensureSynonymBucket(map, key);
  const text = String(value || "").trim();
  if (!normalizedKey || !text) return;
  const token = normalize(text);
  if (!token) return;
  if (!map[normalizedKey].some((item) => normalize(item) === token)) {
    map[normalizedKey].push(text);
  }
};

const digitsOnly = (value) => String(value ?? "").replace(/\D+/g, "");

const buildFieldDescriptorText = (field = {}) =>
  `${field?.label || ""} ${field?.name || ""} ${field?.id || ""} ${field?.placeholder || ""}`;

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

const toScalarText = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return String(value).trim();
};

const collectScalarEntries = (input = {}, prefix = "", depth = 0, output = []) => {
  if (!input || typeof input !== "object" || depth > 4) return output;
  Object.entries(input).forEach(([rawKey, value]) => {
    const key = normalizeKey(rawKey);
    if (!key || value === null || value === undefined) return;
    const prefixed = prefix ? `${prefix}_${key}` : key;

    if (Array.isArray(value)) {
      const text = toScalarText(value);
      if (!text) return;
      output.push([prefixed, text]);
      if (prefixed !== key) output.push([key, text]);
      return;
    }

    if (typeof value === "object") {
      collectScalarEntries(value, prefixed, depth + 1, output);
      return;
    }

    const text = toScalarText(value);
    if (!text) return;
    output.push([prefixed, text]);
    if (prefixed !== key) output.push([key, text]);
  });
  return output;
};

const resolveSourceKey = (sourceKey = "", sourceAliases = BASE_SOURCE_KEY_ALIASES) =>
  normalizeKey(sourceAliases[normalizeKey(sourceKey)] || sourceKey);

const collectDocumentSchemaAliasEntries = (documents = []) => {
  const entries = [];
  (Array.isArray(documents) ? documents : []).forEach((doc) => {
    const extractedData = doc?.extracted_data && typeof doc.extracted_data === "object" ? doc.extracted_data : {};
    const autofillFields =
      doc?.autofill_fields && typeof doc.autofill_fields === "object" ? doc.autofill_fields : {};
    const dynamicSchema =
      doc?.dynamic_schema && typeof doc.dynamic_schema === "object" ? doc.dynamic_schema : {};

    collectScalarEntries(extractedData).forEach(([key]) => {
      entries.push({ alias: key, canonical: key });
    });
    collectScalarEntries(autofillFields).forEach(([key]) => {
      entries.push({ alias: key, canonical: key });
    });
    collectScalarEntries(dynamicSchema?.autofill_payload || {}).forEach(([key]) => {
      entries.push({ alias: key, canonical: key });
    });

    const schemaFields = Array.isArray(dynamicSchema?.fields) ? dynamicSchema.fields : [];
    schemaFields.forEach((schemaField) => {
      const canonicalKey = normalizeKey(
        schemaField?.canonical_key || schemaField?.source_key || schemaField?.key || ""
      );
      if (canonicalKey) {
        entries.push({ alias: canonicalKey, canonical: canonicalKey });
      }

      const aliases = Array.isArray(schemaField?.aliases) ? schemaField.aliases : [];
      const sourceKeys = Array.isArray(schemaField?.source_keys) ? schemaField.source_keys : [];
      [...aliases, ...sourceKeys].forEach((alias) => {
        entries.push({
          alias,
          canonical: canonicalKey || alias,
        });
      });
    });
  });
  return entries;
};

const buildRuntimeMappingContext = ({
  userProfile = {},
  userData = {},
  profileData = {},
  portalCredentials = {},
  documents = [],
  profileDictionary = {},
}) => {
  const fieldSynonyms = cloneSynonymMap(BASE_FIELD_SYNONYMS);
  const sourceAliases = { ...BASE_SOURCE_KEY_ALIASES };

  const registerAlias = (rawAlias = "", rawCanonical = "") => {
    const alias = normalizeKey(rawAlias);
    if (!alias) return;
    const canonicalCandidate = rawCanonical || alias;
    const canonical = resolveSourceKey(canonicalCandidate, sourceAliases) || normalizeKey(canonicalCandidate);
    if (!canonical) return;

    sourceAliases[alias] = canonical;
    addSynonym(fieldSynonyms, canonical, alias.replace(/_/g, " "));
    addSynonym(fieldSynonyms, canonical, canonical.replace(/_/g, " "));
  };

  Object.entries(LOGIN_FIELD_SYNONYMS).forEach(([canonical, aliases]) => {
    registerAlias(canonical, canonical);
    (Array.isArray(aliases) ? aliases : []).forEach((alias) => registerAlias(alias, canonical));
  });

  if (toScalarText(portalCredentials?.email)) {
    registerAlias("portal_email", "email");
    registerAlias("registered_email", "email");
  }
  if (toScalarText(portalCredentials?.password)) {
    registerAlias("portal_password", "password");
    registerAlias("confirm_portal_password", "confirm_password");
  }

  const registerScalarObject = (input = {}, prefix = "") => {
    collectScalarEntries(input, prefix).forEach(([key]) => registerAlias(key, key));
  };

  registerScalarObject(userData, "user");
  registerScalarObject(profileData, "profile");
  registerScalarObject(userProfile, "profile");
  registerScalarObject(profileDictionary, "profile");

  collectDocumentSchemaAliasEntries(documents).forEach(({ alias, canonical }) => {
    registerAlias(alias, canonical || alias);
  });

  return {
    fieldSynonyms,
    sourceAliases,
    canonicalKeys: Object.keys(fieldSynonyms),
  };
};

const hasConsentIntent = (descriptorText = "") => {
  const descriptor = normalize(descriptorText);
  if (!descriptor) return false;
  return CONSENT_INTENT_TOKENS.some((token) => descriptor.includes(normalize(token)));
};

const isMaskedSensitiveFieldForKey = (
  field = {},
  sourceKey = "",
  sourceAliases = BASE_SOURCE_KEY_ALIASES
) => {
  const resolvedKey = resolveSourceKey(sourceKey, sourceAliases);
  if (!MASKED_SENSITIVE_KEYS.has(resolvedKey)) return false;
  return scoreIntentHintHits(buildFieldDescriptorText(field), resolvedKey, sourceAliases) > 0;
};

const isFieldTypeCompatibleWithSourceKey = (
  field = {},
  sourceKey = "",
  sourceAliases = BASE_SOURCE_KEY_ALIASES
) => {
  const key = resolveSourceKey(sourceKey, sourceAliases);
  const type = normalize(field?.type || field?.tag || "text");
  if (!key) return false;
  if (!type) return true;

  if (type === "password") {
    return (
      key === "password" ||
      key === "confirm_password" ||
      isMaskedSensitiveFieldForKey(field, key, sourceAliases)
    );
  }

  if (key === "email") return ["email", "text", "textarea"].includes(type);
  if (key === "phone") return ["tel", "text", "number"].includes(type);
  if (key === "date_of_birth") return ["date", "text"].includes(type);
  if (key === "consent_authentication") return ["checkbox", "radio"].includes(type);
  if (key === "verification_type") return ["radio", "checkbox", "select"].includes(type);
  if (key === "password" || key === "confirm_password") return ["password", "text"].includes(type);

  if (
    [
      "aadhaar_number",
      "eshram_uan",
      "vid_number",
      "pan_number",
      "bank_account",
      "ifsc_code",
      "pincode",
      "age",
      "income",
    ].includes(key)
  ) {
    return !["email", "date", "password", "checkbox", "radio", "file"].includes(type);
  }
  return true;
};

const scoreIntentHintHits = (
  descriptorText = "",
  key = "",
  sourceAliases = BASE_SOURCE_KEY_ALIASES
) => {
  const descriptor = normalize(descriptorText);
  const resolvedKey = resolveSourceKey(key, sourceAliases);
  const tokens = STRICT_INTENT_HINTS[resolvedKey] || [];
  if (!descriptor || tokens.length === 0) return 0;
  return tokens.filter((token) => descriptor.includes(normalize(token))).length;
};

const isValueCompatibleWithSourceKey = (
  sourceKey = "",
  value = "",
  sourceAliases = BASE_SOURCE_KEY_ALIASES
) => {
  const key = resolveSourceKey(sourceKey, sourceAliases);
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
  if (key === "consent_authentication") {
    return ["yes", "no", "true", "false", "1", "0", "agree", "accepted", "decline"].includes(normalize(text));
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

const isLikelyDescriptorKeyConflict = (
  descriptorText = "",
  sourceKey = "",
  sourceAliases = BASE_SOURCE_KEY_ALIASES
) => {
  const descriptorIntent = detectStrongDescriptorIntent(descriptorText);
  if (!descriptorIntent) return false;
  const resolvedKey = resolveSourceKey(sourceKey, sourceAliases);
  return Boolean(resolvedKey) && descriptorIntent !== resolvedKey;
};

const hasSensitiveIntentConflict = (
  descriptorText = "",
  sourceKey = "",
  sourceAliases = BASE_SOURCE_KEY_ALIASES
) => {
  const resolvedKey = resolveSourceKey(sourceKey, sourceAliases);
  if (!STRICT_SENSITIVE_KEYS.has(resolvedKey)) return false;

  const descriptorIntent = detectStrongDescriptorIntent(descriptorText);
  if (!descriptorIntent || descriptorIntent === resolvedKey) return false;
  if (!STRICT_SENSITIVE_KEYS.has(descriptorIntent)) return false;

  const resolvedHits = scoreIntentHintHits(descriptorText, resolvedKey, sourceAliases);
  const intentHits = scoreIntentHintHits(descriptorText, descriptorIntent, sourceAliases);
  return intentHits >= Math.max(resolvedHits, 1);
};

const scoreMatch = (fieldText, key, fieldSynonyms = BASE_FIELD_SYNONYMS) => {
  const text = normalize(fieldText);
  if (!text) return 0;
  let score = 0;
  for (const synonym of fieldSynonyms[key] || []) {
    const token = normalize(synonym);
    if (!token) continue;
    if (text === token) score += 12;
    if (text.includes(token)) score += 6;
    if (token.includes(text) && text.length > 2) score += 3;
  }
  return score;
};

const detectCanonicalField = (
  field,
  {
    canonicalKeys = Object.keys(BASE_FIELD_SYNONYMS),
    fieldSynonyms = BASE_FIELD_SYNONYMS,
    sourceAliases = BASE_SOURCE_KEY_ALIASES,
  } = {}
) => {
  const descriptorText = buildFieldDescriptorText(field);
  const descriptor = normalize(descriptorText);
  const fieldType = normalize(field?.type || field?.tag || "");
  if (fieldType === "checkbox" && hasConsentIntent(descriptorText)) {
    return { key: "consent_authentication", score: 12 };
  }
  const ranked = canonicalKeys
    .map((key) => ({
      key,
      score: scoreMatch(descriptor, key, fieldSynonyms),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || { key: "", score: 0 };
  const runnerUp = ranked[1] || { key: "", score: 0 };
  if (!best.key || best.score < 6) return { key: "", score: 0 };
  if (!isFieldTypeCompatibleWithSourceKey(field, best.key, sourceAliases)) return { key: "", score: 0 };
  if (hasSensitiveIntentConflict(descriptorText, best.key, sourceAliases)) return { key: "", score: 0 };

  if (
    STRICT_SENSITIVE_KEYS.has(best.key) &&
    runnerUp.key &&
    runnerUp.score >= 6 &&
    best.score - runnerUp.score <= 2
  ) {
    return { key: "", score: 0 };
  }

  return {
    key: best.key,
    score: best.score,
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

const normalizeMappedValueBySourceKey = (sourceKey = "", value = "") => {
  const key = normalizeKey(sourceKey);
  const text = toScalarText(value);
  if (!key || !text) return text;

  if (["aadhaar_number", "eshram_uan", "vid_number", "bank_account", "phone", "pincode"].includes(key)) {
    return digitsOnly(text);
  }
  if (key === "pan_number" || key === "ifsc_code") {
    return text.replace(/\s+/g, "").toUpperCase();
  }
  if (key === "verification_type") {
    const lowered = normalize(text);
    if (lowered.includes("vid")) return "vid";
    if (lowered.includes("aadhaar") || lowered.includes("aadhar")) return "aadhaar";
  }
  if (key === "consent_authentication") {
    const lowered = normalize(text);
    if (["true", "1", "yes", "y", "agree", "accepted"].includes(lowered)) return "yes";
    if (["false", "0", "no", "n", "decline"].includes(lowered)) return "no";
  }
  return text;
};

const setDictionaryValue = (dictionary, key, value, { overwrite = false } = {}) => {
  const normalized = normalizeKey(key);
  const text = toScalarText(value);
  if (!normalized || !text) return;
  if (!overwrite && toScalarText(dictionary[normalized])) return;
  dictionary[normalized] = text;
};

const toProfileDictionary = ({
  profile = {},
  profileData = {},
  userData = {},
  credentials = {},
  documents = [],
} = {}) => {
  const locationState = profile?.location?.state || profile?.state || "";
  const locationDistrict = profile?.location?.district || profile?.district || "";
  const locationCity = profile?.location?.city || profile?.city || "";
  const locationPincode = profile?.location?.pincode || profile?.pincode || profile?.pin_code || "";
  const dictionary = {
    name: profile?.name || userData?.name || "",
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
    email: profile?.email || userData?.email || credentials?.email || "",
    phone: profile?.phone || userData?.phone || "",
    mobile: profile?.phone || userData?.phone || "",
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
    applicant_name: profile?.name || userData?.name || "",
    verification_type: profile?.verification_type || "aadhaar",
    password: credentials?.password || "",
    confirm_password: credentials?.password || "",
  };

  collectScalarEntries(profileData).forEach(([key, value]) => {
    setDictionaryValue(dictionary, key, value, { overwrite: false });
  });
  collectScalarEntries(userData).forEach(([key, value]) => {
    setDictionaryValue(dictionary, key, value, { overwrite: false });
  });
  collectScalarEntries(profile).forEach(([key, value]) => {
    setDictionaryValue(dictionary, key, value, { overwrite: true });
  });

  (Array.isArray(documents) ? documents : []).forEach((doc) => {
    const extracted = doc?.extracted_data && typeof doc.extracted_data === "object" ? doc.extracted_data : {};
    const autofill = doc?.autofill_fields && typeof doc.autofill_fields === "object" ? doc.autofill_fields : {};
    const dynamicAutofill =
      doc?.dynamic_schema?.autofill_payload && typeof doc.dynamic_schema.autofill_payload === "object"
        ? doc.dynamic_schema.autofill_payload
        : {};

    [...collectScalarEntries(extracted), ...collectScalarEntries(autofill), ...collectScalarEntries(dynamicAutofill)].forEach(
      ([key, value]) => {
        setDictionaryValue(dictionary, key, value, { overwrite: false });
      }
    );
  });

  if (!dictionary.name && dictionary.applicant_name) dictionary.name = dictionary.applicant_name;
  if (!dictionary.date_of_birth && dictionary.dob) dictionary.date_of_birth = dictionary.dob;
  if (!dictionary.aadhaar_number && dictionary.aadhaar) dictionary.aadhaar_number = dictionary.aadhaar;
  if (!dictionary.pan_number && dictionary.pan) dictionary.pan_number = dictionary.pan;
  if (!dictionary.bank_account && dictionary.account_number) dictionary.bank_account = dictionary.account_number;
  if (!dictionary.income && dictionary.annual_income) dictionary.income = dictionary.annual_income;
  if (!dictionary.email && dictionary.email_id) dictionary.email = dictionary.email_id;
  if (!dictionary.phone && dictionary.mobile_number) dictionary.phone = dictionary.mobile_number;
  if (!dictionary.consent_authentication) dictionary.consent_authentication = "yes";

  return dictionary;
};

const detectDynamicField = (
  field,
  profileDictionary = {},
  { sourceAliases = BASE_SOURCE_KEY_ALIASES } = {}
) => {
  const descriptorText = buildFieldDescriptorText(field);
  const descriptor = normalize(descriptorText);
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

  if (!bestKey) return { key: "", score: 0 };
  const resolvedBestKey = resolveSourceKey(bestKey, sourceAliases);
  if (!isFieldTypeCompatibleWithSourceKey(field, resolvedBestKey, sourceAliases)) {
    return { key: "", score: 0 };
  }
  if (hasSensitiveIntentConflict(descriptorText, resolvedBestKey, sourceAliases)) {
    return { key: "", score: 0 };
  }

  const minScore = STRICT_SENSITIVE_KEYS.has(resolvedBestKey) ? 8 : 6;
  return bestScore >= minScore
    ? { key: resolvedBestKey || bestKey, score: bestScore }
    : { key: "", score: 0 };
};

const mergeAiSuggestions = (
  heuristicMappings,
  aiSuggestions = [],
  profileDictionary = {},
  { sourceAliases = BASE_SOURCE_KEY_ALIASES } = {}
) => {
  if (!Array.isArray(aiSuggestions) || aiSuggestions.length === 0) return heuristicMappings;
  const bySelector = new Map();
  heuristicMappings.forEach((item) => bySelector.set(item.selector, item));

  for (const suggestion of aiSuggestions) {
    const selector = String(suggestion?.selector || "").trim();
    const rawSourceKey = String(suggestion?.source_key || "").trim();
    if (!selector || !rawSourceKey) continue;
    const resolvedSourceKey = resolveSourceKey(rawSourceKey, sourceAliases);
    if (!Object.prototype.hasOwnProperty.call(profileDictionary, resolvedSourceKey)) continue;
    const value = profileDictionary[resolvedSourceKey];
    if (value === null || value === undefined || value === "") continue;
    if (!isValueCompatibleWithSourceKey(resolvedSourceKey, value, sourceAliases)) continue;

    const existing = bySelector.get(selector);
    const existingDescriptor = existing
      ? `${existing?.label || ""} ${existing?.field_name || ""} ${existing?.source_key || ""}`
      : "";
    if (
      existingDescriptor &&
      (isLikelyDescriptorKeyConflict(existingDescriptor, resolvedSourceKey, sourceAliases) ||
        hasSensitiveIntentConflict(existingDescriptor, resolvedSourceKey, sourceAliases))
    ) {
      continue;
    }

    const suggestionConfidence = Number(suggestion?.confidence || 0);
    const existingConfidence = Number(existing?.confidence || 0);
    const minAiConfidence = STRICT_SENSITIVE_KEYS.has(resolvedSourceKey) ? 0.93 : 0.85;
    if (suggestionConfidence < minAiConfidence && existingConfidence >= suggestionConfidence) continue;

    if (!existing || existingConfidence < Math.max(suggestionConfidence, 0.9)) {
      bySelector.set(selector, {
        ...existing,
        selector,
        source_key: resolvedSourceKey,
        value,
        confidence: Math.max(suggestionConfidence, existingConfidence, 0.9),
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
  userData = {},
  profileData = {},
  documents = [],
}) => {
  const profileDictionary = toProfileDictionary({
    profile: userProfile,
    profileData,
    userData,
    credentials: portalCredentials,
    documents,
  });

  const runtimeContext = buildRuntimeMappingContext({
    userProfile,
    userData,
    profileData,
    portalCredentials,
    documents,
    profileDictionary,
  });

  const mappings = [];
  const missingProfileFields = new Set();

  for (const form of forms) {
    const fields = Array.isArray(form?.fields) ? form.fields : [];
    for (const field of fields) {
      if (!field || field.type === "hidden" || field.type === "file") continue;
      const selector = resolveSelector(field);
      if (!selector) continue;

      const inferred = detectCanonicalField(field, runtimeContext);
      const dynamic = inferred.key
        ? { key: "", score: 0 }
        : detectDynamicField(field, profileDictionary, runtimeContext);
      const rawResolvedKey = inferred.key || dynamic.key;
      const resolvedKey = resolveSourceKey(rawResolvedKey, runtimeContext.sourceAliases);
      const resolvedScore = inferred.key ? inferred.score : dynamic.score;
      const detectionSource = inferred.key ? "heuristic" : dynamic.key ? "dynamic_profile" : "";
      if (!resolvedKey) continue;

      const value = profileDictionary[resolvedKey] ?? profileDictionary[rawResolvedKey];
      if (value === null || value === undefined || value === "") {
        missingProfileFields.add(resolvedKey);
        continue;
      }
      const descriptorText = buildFieldDescriptorText(field);
      if (isLikelyDescriptorKeyConflict(descriptorText, resolvedKey, runtimeContext.sourceAliases)) continue;
      if (hasSensitiveIntentConflict(descriptorText, resolvedKey, runtimeContext.sourceAliases)) continue;
      if (!isFieldTypeCompatibleWithSourceKey(field, resolvedKey, runtimeContext.sourceAliases)) continue;
      if (!isValueCompatibleWithSourceKey(resolvedKey, value, runtimeContext.sourceAliases)) continue;
      const minScore = STRICT_SENSITIVE_KEYS.has(resolvedKey) ? 7 : 4;
      if (resolvedScore < minScore) continue;

      let actionType = "fill_input";
      if (field.tag === "select" || field.type === "select") actionType = "select_dropdown";
      if (field.type === "radio" || field.type === "checkbox") actionType = "click";
      const normalizedValue = normalizeMappedValueBySourceKey(resolvedKey, value);
      const mappedValue =
        actionType === "select_dropdown"
          ? findDropdownValue(field, normalizedValue)
          : String(normalizedValue);

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

  const mergedMappings = mergeAiSuggestions(
    mappings,
    aiSuggestions,
    profileDictionary,
    runtimeContext
  );

  return {
    mappings: mergedMappings,
    missing_profile_fields: Array.from(missingProfileFields),
  };
};

