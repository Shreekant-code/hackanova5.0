import UserDocument from "../Schema/UserDocumentschema.js";
import { extractStructuredDataWithGemini } from "./geminiDocumentAgent.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_DOCUMENT_BYTES = Number(process.env.MAX_DOCUMENT_BYTES || 8 * 1024 * 1024);
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 30000);
const OCR_LANGUAGES = String(process.env.OCR_LANGUAGES || "eng")
  .trim()
  .toLowerCase();
const ENFORCE_CLOUDINARY_URL = /^(1|true|yes)$/i.test(
  String(process.env.ENFORCE_CLOUDINARY_URL || "false")
);
const STRICT_REQUIRED_DOC_MATCH = /^(1|true|yes)$/i.test(
  String(process.env.STRICT_REQUIRED_DOC_MATCH || "false")
);
const REJECT_EMPTY_EXTRACTION = /^(1|true|yes)$/i.test(
  String(process.env.REJECT_EMPTY_EXTRACTION || "false")
);
const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || "").trim();
const CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || "").trim();
const CLOUDINARY_UPLOAD_PRESET = String(process.env.CLOUDINARY_UPLOAD_PRESET || "").trim();
const CLOUDINARY_FOLDER = String(process.env.CLOUDINARY_FOLDER || "").trim();

const CONTROLLER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(CONTROLLER_DIR, "..");

const FILE_EXT_TO_MIME = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tiff: "image/tiff",
  tif: "image/tiff",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  txt: "text/plain",
};

const DOCUMENT_SPECS = [
  {
    type: "aadhaar_card",
    category: "identity",
    aliases: ["aadhaar", "aadhar", "uidai", "aadhaar card", "aadhar card"],
    fields: ["name", "date_of_birth", "aadhaar_number", "address"],
    preferred_additional_fields: [
      "gender",
      "year_of_birth",
      "father_name",
      "husband_name",
      "guardian_name",
      "address_line_1",
      "address_line_2",
      "city",
      "district",
      "state",
      "pincode",
    ],
  },
  {
    type: "pan_card",
    category: "identity",
    aliases: ["pan", "pan card", "permanent account number"],
    fields: ["name", "pan_number"],
  },
  {
    type: "income_certificate",
    category: "income",
    aliases: ["income certificate", "income proof", "annual income", "salary certificate"],
    fields: ["name", "annual_income"],
  },
  {
    type: "bank_passbook",
    category: "bank",
    aliases: ["bank passbook", "passbook", "bank statement", "cancelled cheque", "bank proof"],
    fields: ["account_number", "ifsc_code", "bank_name", "name"],
  },
  {
    type: "education_certificate",
    category: "education",
    aliases: ["education certificate", "marksheet", "degree certificate", "school certificate"],
    fields: ["candidate_name", "course", "institution", "year_of_passing"],
  },
  {
    type: "disability_certificate",
    category: "disability",
    aliases: ["disability certificate", "pwd certificate", "divyang certificate"],
    fields: ["name", "disability_type", "disability_percentage"],
  },
];

const COMMON_AUTOFILL_MAP = {
  name: "applicant_name",
  full_name: "applicant_name",
  applicant_name: "applicant_name",
  beneficiary_name: "applicant_name",
  candidate_name: "applicant_name",
  student_name: "applicant_name",
  date_of_birth: "dob",
  dob: "dob",
  birth_date: "dob",
  year_of_birth: "dob",
  address: "address",
  aadhaar_number: "aadhaar",
  aadhaar: "aadhaar",
  aadhar: "aadhaar",
  uid: "aadhaar",
  uid_number: "aadhaar",
  pan_number: "pan",
  pan: "pan",
  annual_income: "annual_income",
  income: "annual_income",
  family_income: "annual_income",
  household_income: "annual_income",
  account_number: "bank_account",
  bank_account_number: "bank_account",
  account_no: "bank_account",
  ac_no: "bank_account",
  ifsc_code: "ifsc",
  ifsc: "ifsc",
  bank_name: "bank_name",
  disability_type: "disability_type",
  disability_percentage: "disability_percentage",
  disability_percent: "disability_percentage",
  course: "course",
  institution: "institution",
  institution_name: "institution",
  college_name: "institution",
  university_name: "institution",
  school_name: "institution",
  year_of_passing: "year_of_passing",
  email: "email",
  email_id: "email",
  phone: "phone",
  mobile: "phone",
  mobile_number: "phone",
  contact_number: "phone",
  pincode: "pincode",
  pin_code: "pincode",
  postal_code: "pincode",
  district: "district",
  city: "city",
  state: "state",
  gender: "gender",
  father_name: "father_name",
  husband_name: "husband_name",
  guardian_name: "guardian_name",
  address_line_1: "address_line_1",
  address_line_2: "address_line_2",
  age: "age",
  occupation: "occupation",
  category: "category",
};

const AUTOFILL_KEY_ALIASES = {
  applicant_name: ["name", "full_name", "beneficiary_name", "candidate_name", "student_name"],
  dob: ["date_of_birth", "birth_date", "dob", "year_of_birth"],
  aadhaar: ["aadhaar_number", "aadhaar", "aadhar", "uid", "uid_number", "aadhaar_no", "aadhaar_num"],
  pan: ["pan_number", "pan", "pan_no", "pan_num", "permanent_account_number"],
  annual_income: ["annual_income", "income", "family_income", "household_income", "income_per_annum"],
  bank_account: ["bank_account", "account_number", "bank_account_number", "account_no", "ac_no"],
  ifsc: ["ifsc", "ifsc_code", "ifsc_no"],
  institution: ["institution", "institution_name", "college_name", "university_name", "school_name"],
  disability_percentage: ["disability_percentage", "disability_percent", "percentage"],
  phone: ["phone", "mobile", "mobile_number", "contact_number"],
  email: ["email", "email_id", "mail_id"],
  pincode: ["pincode", "pin_code", "postal_code"],
  city: ["city", "town"],
  district: ["district", "zilla"],
  state: ["state", "state_name"],
  father_name: ["father_name", "father_s_name", "father"],
  husband_name: ["husband_name", "spouse_name", "husband"],
  guardian_name: ["guardian_name", "care_of", "c_o", "parent_name"],
};

const FIELD_KEY_ALIASES = {
  name: ["full_name", "applicant_name", "beneficiary_name"],
  candidate_name: ["student_name"],
  date_of_birth: ["dob", "birth_date", "date_of_birth", "year_of_birth", "yob"],
  aadhaar_number: ["aadhaar", "aadhar", "aadhaar_no", "aadhaar_num", "uid", "uid_number"],
  gender: ["sex"],
  year_of_birth: ["yob", "birth_year"],
  father_name: ["father_s_name", "father", "s_o", "d_o"],
  husband_name: ["husband_s_name", "spouse_name", "w_o"],
  guardian_name: ["care_of", "c_o", "guardian", "parent_name"],
  address: ["residential_address", "permanent_address", "communication_address"],
  address_line_1: ["address1", "address_line1"],
  address_line_2: ["address2", "address_line2"],
  pincode: ["pin_code", "postal_code", "zip_code"],
  city: ["town"],
  district: ["zilla"],
  state: ["state_name"],
  pan_number: ["pan", "pan_no", "pan_num", "permanent_account_number"],
  annual_income: ["income", "family_income", "household_income", "income_per_annum"],
  account_number: ["bank_account", "bank_account_number", "account_no", "ac_no"],
  ifsc_code: ["ifsc", "ifsc_no"],
  institution: ["institution_name", "college_name", "university_name", "school_name"],
  disability_percentage: ["disability_percent", "percentage"],
};

const CATEGORY_KEYWORDS = {
  identity: ["identity", "id proof", "photo id", "government id"],
  income: ["income", "salary", "earning", "itr", "tax return"],
  disability: ["disability", "pwd", "divyang", "benchmark disability", "handicap"],
  bank: ["bank", "account", "ifsc", "passbook", "cheque"],
  education: ["education", "certificate", "marksheet", "degree", "course", "institution"],
};

const INDIAN_STATES_AND_UTS = [
  "andaman and nicobar islands",
  "andhra pradesh",
  "arunachal pradesh",
  "assam",
  "bihar",
  "chandigarh",
  "chhattisgarh",
  "dadra and nagar haveli and daman and diu",
  "delhi",
  "goa",
  "gujarat",
  "haryana",
  "himachal pradesh",
  "jammu and kashmir",
  "jharkhand",
  "karnataka",
  "kerala",
  "ladakh",
  "lakshadweep",
  "madhya pradesh",
  "maharashtra",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "odisha",
  "puducherry",
  "punjab",
  "rajasthan",
  "sikkim",
  "tamil nadu",
  "telangana",
  "tripura",
  "uttar pradesh",
  "uttarakhand",
  "west bengal",
];

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const STATE_NAME_PATTERN = new RegExp(
  `\\b(${INDIAN_STATES_AND_UTS.map((item) => escapeRegex(item)).join("|")})\\b`,
  "i"
);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeFieldKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const toLanguageList = (value = "") =>
  String(value || "")
    .split("+")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const OCR_LANGUAGE_LIST = toLanguageList(OCR_LANGUAGES);

const hasLanguageSet = (dirPath = "", langs = [], extension = "traineddata") =>
  langs.every((lang) => fs.existsSync(path.join(dirPath, `${lang}.${extension}`)));

const resolveLocalTessdataConfig = (langs = []) => {
  const languageSet = Array.isArray(langs) && langs.length > 0 ? langs : ["eng"];
  const candidateDirs = [
    path.join(PROJECT_ROOT, "tessdata"),
    PROJECT_ROOT,
    process.cwd(),
  ];

  for (const dirPath of candidateDirs) {
    if (!dirPath || !fs.existsSync(dirPath)) continue;

    if (hasLanguageSet(dirPath, languageSet, "traineddata")) {
      return {
        langPath: dirPath,
        gzip: false,
      };
    }
    if (hasLanguageSet(dirPath, languageSet, "traineddata.gz")) {
      return {
        langPath: dirPath,
        gzip: true,
      };
    }
  }

  return {
    langPath: "",
    gzip: true,
  };
};

const LOCAL_TESSDATA_CONFIG = resolveLocalTessdataConfig(OCR_LANGUAGE_LIST);

const parseJsonObject = (value, fallback = {}) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const toStringList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const cleanValue = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:,\-]+|[\s,;.\-]+$/g, "")
    .trim();

const normalizeDocText = (text) =>
  String(text ?? "")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);

const inferMimeType = (providedType, headerType, url) => {
  const cleanProvided = normalize(providedType);
  if (cleanProvided.includes("/")) return cleanProvided;

  const cleanHeader = normalize(headerType).split(";")[0];
  if (cleanHeader && cleanHeader.includes("/")) return cleanHeader;

  const urlText = String(url || "").toLowerCase();
  const extension = urlText.includes(".") ? urlText.split(".").pop().split("?")[0] : "";
  return FILE_EXT_TO_MIME[extension] || "application/octet-stream";
};

const isCloudinaryUrl = (url) => {
  try {
    const parsed = new URL(String(url || "").trim());
    const host = parsed.hostname.toLowerCase();
    return host === "res.cloudinary.com" || host.endsWith(".cloudinary.com");
  } catch {
    return false;
  }
};

const pickDocumentSpec = (documentName) => {
  const doc = normalize(documentName);
  for (const spec of DOCUMENT_SPECS) {
    if (spec.aliases.some((alias) => doc.includes(normalize(alias)) || normalize(alias).includes(doc))) {
      return spec;
    }
  }
  return {
    type: "generic_document",
    category: "generic",
    aliases: [doc],
    fields: [],
  };
};

const findRequiredDocMatch = (documentName, requiredDocs = []) => {
  const doc = normalize(documentName);
  const spec = pickDocumentSpec(documentName);
  let best = "";
  let bestScore = 0;

  for (const required of requiredDocs) {
    const req = normalize(required);
    if (!req) continue;

    let score = 0;
    if (req.includes(doc) || doc.includes(req)) score += 5;
    for (const alias of spec.aliases) {
      const token = normalize(alias);
      if (token && req.includes(token)) score += 3;
    }
    for (const keyword of CATEGORY_KEYWORDS[spec.category] || []) {
      if (req.includes(normalize(keyword))) score += 2;
    }
    const docTokens = doc.split(/[^a-z0-9]+/g).filter((token) => token.length > 2);
    score += docTokens.filter((token) => req.includes(token)).length;

    if (score > bestScore) {
      bestScore = score;
      best = required;
    }
  }

  return {
    matched: bestScore >= 2,
    matchedDocument: best,
  };
};

const buildDedupeKey = ({ documentSpec, matchedRequiredDocument, documentName }) => {
  const matched = normalize(matchedRequiredDocument);
  if (matched) return `required:${matched}`;
  if (documentSpec?.type && documentSpec.type !== "generic_document") {
    return `type:${normalize(documentSpec.type)}`;
  }
  return `name:${normalize(documentName)}`;
};

const normalizeDate = (value) => {
  try {
    return new Date(value).toISOString();
  } catch {
    return "";
  }
};

const buildCloudinarySignature = (params = {}, apiSecret = "") => {
  const signingString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto
    .createHash("sha1")
    .update(`${signingString}${apiSecret}`)
    .digest("hex");
};

const uploadFileBufferToCloudinary = async ({ bufferData, mimeType, fileName }) => {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error("CLOUDINARY_CLOUD_NAME is missing");
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/auto/upload`;
  const formData = new FormData();
  const safeFileName = String(fileName || "document").trim() || "document";
  const blob = new Blob([bufferData], { type: mimeType || "application/octet-stream" });

  formData.append("file", blob, safeFileName);
  if (CLOUDINARY_FOLDER) formData.append("folder", CLOUDINARY_FOLDER);

  if (CLOUDINARY_UPLOAD_PRESET) {
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  } else {
    if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error(
        "Cloudinary config missing. Set CLOUDINARY_UPLOAD_PRESET or CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET."
      );
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const signParams = {};
    if (CLOUDINARY_FOLDER) signParams.folder = CLOUDINARY_FOLDER;
    signParams.timestamp = timestamp;
    const signature = buildCloudinarySignature(signParams, CLOUDINARY_API_SECRET);

    formData.append("api_key", CLOUDINARY_API_KEY);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Cloudinary upload failed: ${response.status}`;
    throw new Error(message);
  }

  const secureUrl = String(payload?.secure_url || "").trim();
  if (!secureUrl) {
    throw new Error("Cloudinary upload succeeded but secure_url missing");
  }
  return {
    secure_url: secureUrl,
    format: String(payload?.format || "").trim(),
    resource_type: String(payload?.resource_type || "").trim(),
    bytes: Number(payload?.bytes || 0),
    original_filename: String(payload?.original_filename || "").trim(),
  };
};

const resolveAllowedFieldKey = (normalizedInputKey, allowedLookup = new Map()) => {
  if (!normalizedInputKey) return "";
  if (allowedLookup.has(normalizedInputKey)) return allowedLookup.get(normalizedInputKey);

  for (const [allowedKey] of allowedLookup.entries()) {
    const aliases = FIELD_KEY_ALIASES[allowedKey] || [];
    const aliasHit = aliases.some((alias) => normalizeFieldKey(alias) === normalizedInputKey);
    if (aliasHit) return allowedKey;
  }
  return "";
};

const sanitizeExtractedData = (rawExtractedData, allowedFields = []) => {
  const source =
    rawExtractedData && typeof rawExtractedData === "object" && !Array.isArray(rawExtractedData)
      ? rawExtractedData
      : {};
  const allowedLookup = new Map();
  (allowedFields || []).forEach((field) => {
    const normalizedAllowed = normalizeFieldKey(field);
    if (normalizedAllowed) allowedLookup.set(normalizedAllowed, normalizedAllowed);
  });
  const strictAllowed = allowedLookup.size > 0;

  const sanitized = {};
  Object.entries(source).forEach(([key, value]) => {
    const normalizedInputKey = normalizeFieldKey(key);
    const outputKey = strictAllowed
      ? resolveAllowedFieldKey(normalizedInputKey, allowedLookup)
      : normalizedInputKey;
    if (!outputKey) return;
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      const items = value.map((item) => cleanValue(item)).filter(Boolean);
      if (items.length > 0) sanitized[outputKey] = items;
      return;
    }

    if (typeof value === "object") return;

    const cleaned = cleanValue(value);
    if (!cleaned) return;
    sanitized[outputKey] = cleaned;
  });

  return sanitized;
};

const toAutofillValue = (value) => {
  if (Array.isArray(value)) {
    const items = value.map((item) => cleanValue(item)).filter(Boolean);
    return items.length > 0 ? items.join(", ") : "";
  }
  return cleanValue(value);
};

const setAutofillValueIfMissing = (target, key, value) => {
  const normalizedKey = normalizeFieldKey(key);
  const text = toAutofillValue(value);
  if (!normalizedKey || !text) return;
  if (Object.prototype.hasOwnProperty.call(target, normalizedKey) && cleanValue(target[normalizedKey])) {
    return;
  }
  target[normalizedKey] = text;
};

const mergeAutofillPayloads = (...payloads) => {
  const merged = {};
  payloads.forEach((payload) => {
    Object.entries(payload || {}).forEach(([key, value]) => {
      setAutofillValueIfMissing(merged, key, value);
    });
  });
  return merged;
};

const collectAutofillAliases = ({ sourceKey = "", canonicalKey = "" }) => {
  const source = normalizeFieldKey(sourceKey);
  const canonical = normalizeFieldKey(canonicalKey);
  const aliases = new Set();
  if (canonical) aliases.add(canonical);
  if (source) aliases.add(source);

  (AUTOFILL_KEY_ALIASES[canonical] || []).forEach((alias) => {
    const normalizedAlias = normalizeFieldKey(alias);
    if (normalizedAlias) aliases.add(normalizedAlias);
  });
  (FIELD_KEY_ALIASES[source] || []).forEach((alias) => {
    const normalizedAlias = normalizeFieldKey(alias);
    if (normalizedAlias) aliases.add(normalizedAlias);
  });
  (FIELD_KEY_ALIASES[canonical] || []).forEach((alias) => {
    const normalizedAlias = normalizeFieldKey(alias);
    if (normalizedAlias) aliases.add(normalizedAlias);
  });

  Object.entries(COMMON_AUTOFILL_MAP).forEach(([inputKey, mappedKey]) => {
    if (normalizeFieldKey(mappedKey) !== canonical) return;
    const normalizedInput = normalizeFieldKey(inputKey);
    if (normalizedInput) aliases.add(normalizedInput);
  });

  return Array.from(aliases);
};

const mapAutofillFields = (extractedData) => {
  const autofill = {};
  Object.entries(extractedData || {}).forEach(([key, value]) => {
    const sourceKey = normalizeFieldKey(key);
    const canonicalKey = normalizeFieldKey(COMMON_AUTOFILL_MAP[normalize(key)] || sourceKey);
    if (!canonicalKey) return;

    setAutofillValueIfMissing(autofill, canonicalKey, value);
    const aliases = collectAutofillAliases({
      sourceKey,
      canonicalKey,
    });
    aliases.forEach((aliasKey) => {
      setAutofillValueIfMissing(autofill, aliasKey, value);
    });
  });
  return autofill;
};

const buildDynamicAutofillSchema = ({
  documentName = "",
  documentSpec = {},
  extractedData = {},
  autofillFields = {},
  extractionEngine = "",
  generatedAt = new Date(),
}) => {
  const extracted = sanitizeExtractedData(extractedData || {}, []);
  const autofill = sanitizeExtractedData(autofillFields || {}, []);
  const fieldMap = new Map();

  const register = (rawKey, rawValue, sourceType) => {
    const sourceKey = normalizeFieldKey(rawKey);
    const value = toAutofillValue(rawValue);
    if (!sourceKey || !value) return;
    const canonicalKey = normalizeFieldKey(COMMON_AUTOFILL_MAP[normalize(rawKey)] || sourceKey);
    if (!canonicalKey) return;

    let entry = fieldMap.get(canonicalKey);
    if (!entry) {
      entry = {
        canonical_key: canonicalKey,
        value,
        source_keys: new Set(),
        aliases: new Set(),
        source_types: new Set(),
      };
      fieldMap.set(canonicalKey, entry);
    }

    if (!cleanValue(entry.value)) entry.value = value;
    entry.source_keys.add(sourceKey);
    entry.source_types.add(sourceType);
    collectAutofillAliases({
      sourceKey,
      canonicalKey,
    }).forEach((alias) => entry.aliases.add(alias));
  };

  Object.entries(extracted).forEach(([key, value]) => {
    register(key, value, "extracted_data");
  });
  Object.entries(autofill).forEach(([key, value]) => {
    register(key, value, "autofill_fields");
  });

  const fields = [];
  const autofillPayload = {};
  fieldMap.forEach((entry) => {
    const aliases = Array.from(entry.aliases).filter(Boolean).sort();
    const value = toAutofillValue(entry.value);
    if (!value) return;

    setAutofillValueIfMissing(autofillPayload, entry.canonical_key, value);
    aliases.forEach((alias) => setAutofillValueIfMissing(autofillPayload, alias, value));

    fields.push({
      canonical_key: entry.canonical_key,
      value,
      aliases,
      source_keys: Array.from(entry.source_keys).filter(Boolean).sort(),
      source_types: Array.from(entry.source_types).filter(Boolean).sort(),
    });
  });

  fields.sort((a, b) => a.canonical_key.localeCompare(b.canonical_key));

  return {
    schema_version: "v1",
    generated_at: normalizeDate(generatedAt),
    document_name: String(documentName || "").trim(),
    document_type: String(documentSpec?.type || "generic_document").trim(),
    document_category: String(documentSpec?.category || "generic").trim(),
    extraction_engine: String(extractionEngine || "").trim(),
    field_count: fields.length,
    fields,
    autofill_payload: autofillPayload,
    extracted_payload: extracted,
  };
};

const hydrateRecordWithDynamicSchema = (record, { extractionEngine = "" } = {}) => {
  const baseRecord =
    record && typeof record.toObject === "function" ? record.toObject() : record || {};
  const extracted = normalizeExtractedDataForStorage(
    sanitizeExtractedData(baseRecord?.extracted_data || {}, [])
  );
  const mappedAutofill = mapAutofillFields(extracted);
  const storedAutofill = sanitizeExtractedData(baseRecord?.autofill_fields || {}, []);
  const existingSchema =
    baseRecord?.dynamic_schema &&
    typeof baseRecord.dynamic_schema === "object" &&
    !Array.isArray(baseRecord.dynamic_schema)
      ? baseRecord.dynamic_schema
      : null;
  const existingSchemaPayload = sanitizeExtractedData(existingSchema?.autofill_payload || {}, []);

  const fallbackSchema = buildDynamicAutofillSchema({
    documentName: baseRecord?.document_name || "",
    documentSpec: pickDocumentSpec(baseRecord?.document_name || ""),
    extractedData: extracted,
    autofillFields: mergeAutofillPayloads(mappedAutofill, storedAutofill),
    extractionEngine,
    generatedAt: baseRecord?.uploaded_at || new Date(),
  });

  const dynamicSchema =
    existingSchema && Object.keys(existingSchemaPayload).length > 0
      ? {
          ...fallbackSchema,
          ...existingSchema,
          autofill_payload: mergeAutofillPayloads(
            fallbackSchema.autofill_payload,
            existingSchemaPayload
          ),
        }
      : fallbackSchema;

  return {
    ...baseRecord,
    extracted_data: extracted,
    autofill_fields: mergeAutofillPayloads(
      mappedAutofill,
      storedAutofill,
      dynamicSchema.autofill_payload || {}
    ),
    dynamic_schema: dynamicSchema,
  };
};

const buildExtractionSummary = (extractedData, expectedFields = []) => {
  const extractedFields = Object.keys(extractedData || {});
  const normalizedExtracted = new Set(extractedFields.map((field) => normalize(field)));
  const expected = (expectedFields || []).map((field) => String(field).trim()).filter(Boolean);
  const missingFields = expected.filter((field) => !normalizedExtracted.has(normalize(field)));
  const completedCount = expected.length - missingFields.length;
  const completeness = expected.length > 0 ? Number((completedCount / expected.length).toFixed(2)) : 0;
  const quality =
    expected.length === 0
      ? "unknown"
      : completedCount === 0
        ? "none"
        : completedCount === expected.length
          ? "complete"
          : "partial";

  return {
    expected_fields: expected,
    extracted_fields: extractedFields,
    missing_fields: missingFields,
    completeness,
    quality,
  };
};

const mergeIfMissing = (target, key, value) => {
  const text = cleanValue(value);
  if (!text) return;
  if (Object.prototype.hasOwnProperty.call(target, key) && cleanValue(target[key])) return;
  target[key] = text;
};

const buildMergedAutofillSnapshot = (records = []) => {
  const mergedExtractedData = {};
  const mergedAutofillFields = {};

  (Array.isArray(records) ? records : []).forEach((record) => {
    const hydratedRecord = hydrateRecordWithDynamicSchema(record, {
      extractionEngine: "historical_record",
    });
    const extracted = sanitizeExtractedData(hydratedRecord?.extracted_data || {}, []);
    const mappedAutofill = mapAutofillFields(extracted);
    const storedAutofill = sanitizeExtractedData(hydratedRecord?.autofill_fields || {}, []);
    const dynamicAutofill = sanitizeExtractedData(
      hydratedRecord?.dynamic_schema?.autofill_payload || {},
      []
    );

    Object.entries(extracted).forEach(([key, value]) => {
      mergeIfMissing(mergedExtractedData, key, value);
    });
    Object.entries(
      mergeAutofillPayloads(mappedAutofill, storedAutofill, dynamicAutofill)
    ).forEach(([key, value]) => {
      mergeIfMissing(mergedAutofillFields, normalizeFieldKey(key), value);
    });
  });

  const mergedDynamicSchema = buildDynamicAutofillSchema({
    documentName: "merged_user_context",
    documentSpec: {
      type: "merged_context",
      category: "context",
    },
    extractedData: mergedExtractedData,
    autofillFields: mergedAutofillFields,
    extractionEngine: "merged_context",
    generatedAt: new Date(),
  });

  return {
    merged_extracted_data: mergedExtractedData,
    merged_autofill_fields: mergedAutofillFields,
    merged_dynamic_schema: mergedDynamicSchema,
  };
};

const findBestRecordForRequiredDoc = (requiredDoc, records) => {
  const required = normalize(requiredDoc);
  if (!required) return null;

  let best = null;
  let bestScore = -1;
  for (const record of records || []) {
    const name = normalize(record.document_name);
    const matched = normalize(record.required_document_match);
    const dedupe = normalize(record.dedupe_key);
    let score = 0;
    if (matched === required) score += 6;
    if (dedupe.includes(required)) score += 4;
    if (name.includes(required) || required.includes(name)) score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = record;
    }
  }

  return bestScore > 0 ? best : null;
};

const buildRequiredDocumentsStatus = (requiredDocs = [], records = []) => {
  const normalizedRequiredDocs = toStringList(requiredDocs);
  const requiredStatus = normalizedRequiredDocs.map((requiredDoc) => {
    const record = findBestRecordForRequiredDoc(requiredDoc, records);
    return {
      document_name: requiredDoc,
      uploaded: Boolean(record),
      uploaded_document_name: record?.document_name || "",
      cloudinary_url: record?.cloudinary_url || "",
      uploaded_at: record?.uploaded_at ? normalizeDate(record.uploaded_at) : "",
    };
  });

  return {
    required_documents: requiredStatus,
    next_documents_to_upload: requiredStatus
      .filter((item) => !item.uploaded)
      .map((item) => item.document_name),
  };
};

const fetchDocumentBinary = async (cloudinaryUrl, fileType) => {
  const response = await fetch(cloudinaryUrl);
  if (!response.ok) {
    throw new Error(`Document fetch failed with status ${response.status}`);
  }

  const headerMimeType = response.headers.get("content-type") || "";
  const mimeType = inferMimeType(fileType, headerMimeType, cloudinaryUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("Uploaded document is empty");
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new Error(`Document size exceeds ${MAX_DOCUMENT_BYTES} bytes`);
  }

  return { mimeType, bufferData: buffer };
};

const extractTextFromPdf = async (bufferData) => {
  let parsedText = "";
  try {
    const pdfModule = await import("pdf-parse");
    const pdfParse = pdfModule.default || pdfModule;
    const parsed = await pdfParse(bufferData);
    parsedText = normalizeDocText(parsed?.text || "");
  } catch {
    parsedText = "";
  }
  if (parsedText) return parsedText;

  // Best-effort fallback for scanned/image-heavy PDFs.
  return extractTextFromImage(bufferData);
};

const extractTextFromImage = async (bufferData) => {
  try {
    const tesseractModule = await import("tesseract.js");
    const createWorker = tesseractModule.createWorker;
    if (!createWorker) return "";
    const workerOptions = {};
    if (LOCAL_TESSDATA_CONFIG.langPath) {
      workerOptions.langPath = LOCAL_TESSDATA_CONFIG.langPath;
      workerOptions.cachePath = LOCAL_TESSDATA_CONFIG.langPath;
      workerOptions.gzip = LOCAL_TESSDATA_CONFIG.gzip;
    }
    const worker = await createWorker(
      OCR_LANGUAGE_LIST.length > 0 ? OCR_LANGUAGE_LIST.join("+") : "eng",
      1,
      workerOptions
    );
    try {
      await worker
        .setParameters({
          preserve_interword_spaces: "1",
        })
        .catch(() => {});
      const result = await withTimeout(
        worker.recognize(bufferData),
        OCR_TIMEOUT_MS,
        "OCR timed out"
      );
      return normalizeDocText(result?.data?.text || "");
    } finally {
      await worker.terminate().catch(() => {});
    }
  } catch {
    return "";
  }
};

const extractTextFromDocument = async (bufferData, mimeType) => {
  const normalizedMime = normalize(mimeType);
  if (normalizedMime.includes("pdf")) {
    return extractTextFromPdf(bufferData);
  }
  if (normalizedMime.startsWith("image/")) {
    return extractTextFromImage(bufferData);
  }

  try {
    return normalizeDocText(bufferData.toString("utf8"));
  } catch {
    return "";
  }
};

const captureFirst = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const cleaned = cleanValue(match[1]);
    if (cleaned) return cleaned;
  }
  return "";
};

const GENERIC_FIELD_EXCLUDE = new Set([
  "government_of_india",
  "govt_of_india",
  "india",
  "signature",
  "authorized_signatory",
  "issued_by",
  "valid_till",
  "qr_code",
  "bar_code",
]);

const extractGenericKeyValuePairs = (text) => {
  const output = {};
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanValue(line))
    .filter(Boolean);

  for (const line of lines) {
    if (line.length < 4 || line.length > 240) continue;
    const match =
      line.match(/^([a-z][a-z0-9 .()/'&-]{1,80})\s*[:\-]\s*(.+)$/i) ||
      line.match(/^([a-z][a-z0-9 .()/'&-]{1,80})\s{2,}(.+)$/i);
    if (!match?.[1] || !match?.[2]) continue;

    const key = normalizeFieldKey(match[1]);
    const value = cleanValue(match[2]);
    if (!key || !value) continue;
    if (key.length > 64) continue;
    if (value.length > 180) continue;
    if (GENERIC_FIELD_EXCLUDE.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(output, key)) continue;
    output[key] = value;
  }

  return output;
};

const parseAmountToNumberString = (value, unit) => {
  const numeric = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(numeric)) return "";
  const normalizedUnit = normalize(unit);

  let output = numeric;
  if (normalizedUnit.startsWith("lakh") || normalizedUnit === "lac" || normalizedUnit === "lacs") {
    output = numeric * 100000;
  } else if (normalizedUnit.startsWith("crore")) {
    output = numeric * 10000000;
  } else if (normalizedUnit === "k" || normalizedUnit.startsWith("thousand")) {
    output = numeric * 1000;
  }
  return String(Math.round(output));
};

const normalizeAadhaarValue = (value) => {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!/^\d{12}$/.test(digits)) return "";
  if (/^(\d)\1{11}$/.test(digits)) return "";
  return digits;
};

const normalizePanValue = (value) => {
  const text = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(text) ? text : "";
};

const normalizeIfscValue = (value) => {
  const text = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(text) ? text : "";
};

const normalizeAccountNumberValue = (value) => {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!/^\d{9,20}$/.test(digits)) return "";
  return digits;
};

const normalizeIncomeValue = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const withUnit = text.match(
    /([0-9][0-9,]{2,})(?:\s*(lakh|lakhs|lac|lacs|crore|crores|thousand|k))?/i
  );
  if (withUnit?.[1]) {
    const normalized = parseAmountToNumberString(withUnit[1], withUnit[2] || "");
    if (normalized) return normalized;
  }
  const digits = text.replace(/[^\d]/g, "");
  return digits || "";
};

const normalizePercentageValue = (value) => {
  const numeric = Number(String(value || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  if (numeric < 0 || numeric > 100) return "";
  return String(numeric);
};

const normalizeYearOfBirthValue = (value) => {
  const match = String(value || "").match(/\b((?:19|20)\d{2})\b/);
  return match?.[1] || "";
};

const normalizePincodeValue = (value) => {
  const match = String(value || "").match(/\b([1-9]\d{5})\b/);
  return match?.[1] || "";
};

const normalizeGenderValue = (value) => {
  const token = normalize(value);
  if (!token) return "";
  if (token === "m" || token.startsWith("male")) return "Male";
  if (token === "f" || token.startsWith("female")) return "Female";
  if (token === "t" || token.startsWith("trans")) return "Transgender";
  if (token === "o" || token.startsWith("other")) return "Other";
  return cleanValue(value);
};

const normalizeExtractedDataForStorage = (extractedData = {}) => {
  const out = { ...(extractedData || {}) };
  if (out.aadhaar_number) {
    const normalized = normalizeAadhaarValue(out.aadhaar_number);
    if (normalized) out.aadhaar_number = normalized;
  }
  if (out.pan_number) {
    const normalized = normalizePanValue(out.pan_number);
    if (normalized) out.pan_number = normalized;
  }
  if (out.ifsc_code) {
    const normalized = normalizeIfscValue(out.ifsc_code);
    if (normalized) out.ifsc_code = normalized;
  }
  if (out.account_number) {
    const normalized = normalizeAccountNumberValue(out.account_number);
    if (normalized) out.account_number = normalized;
  }
  if (out.annual_income) {
    const normalized = normalizeIncomeValue(out.annual_income);
    if (normalized) out.annual_income = normalized;
  }
  if (out.date_of_birth) {
    const normalized = normalizeDateValue(out.date_of_birth);
    if (normalized) out.date_of_birth = normalized;
  }
  if (out.year_of_birth) {
    const normalized = normalizeYearOfBirthValue(out.year_of_birth);
    if (normalized) out.year_of_birth = normalized;
  }
  if (!out.year_of_birth && out.date_of_birth) {
    const derivedYear = normalizeYearOfBirthValue(out.date_of_birth);
    if (derivedYear) out.year_of_birth = derivedYear;
  }
  if (out.pincode) {
    const normalized = normalizePincodeValue(out.pincode);
    if (normalized) out.pincode = normalized;
  }
  if (out.gender) {
    const normalized = normalizeGenderValue(out.gender);
    if (normalized) out.gender = normalized;
  }
  if (out.disability_percentage) {
    const normalized = normalizePercentageValue(out.disability_percentage);
    if (normalized) out.disability_percentage = normalized;
  }
  return out;
};

const extractName = (text) =>
  captureFirst(text, [
    /(?:^|\n)\s*name(?:\s+of\s+(?:applicant|holder|student|candidate|beneficiary))?\s*[:\-]\s*([a-z][a-z .']{2,80})/im,
    /(?:^|\n)\s*applicant\s+name\s*[:\-]\s*([a-z][a-z .']{2,80})/im,
  ]);

const extractCandidateName = (text) =>
  captureFirst(text, [
    /(?:^|\n)\s*candidate\s+name\s*[:\-]\s*([a-z][a-z .']{2,80})/im,
    /(?:^|\n)\s*student\s+name\s*[:\-]\s*([a-z][a-z .']{2,80})/im,
  ]) || extractName(text);

const normalizeYear = (yearText) => {
  const yearRaw = String(yearText || "").trim();
  if (!/^\d{2,4}$/.test(yearRaw)) return "";
  if (yearRaw.length === 4) return yearRaw;
  const twoDigit = Number(yearRaw);
  if (!Number.isFinite(twoDigit)) return "";
  return String(twoDigit >= 50 ? 1900 + twoDigit : 2000 + twoDigit);
};

const normalizeDateValue = (value) => {
  const text = cleanValue(value);
  if (!text) return "";

  const ymd = text.match(/^((?:19|20)\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, "0");
    const day = ymd[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const year = normalizeYear(dmy[3]);
    if (!year) return text;
    const month = dmy[2].padStart(2, "0");
    const day = dmy[1].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const monthNamed = text.match(
    /^(\d{1,2})\s+([a-z]{3,9})\s+(\d{2,4})$/i
  );
  if (monthNamed) {
    const monthMap = {
      jan: "01",
      january: "01",
      feb: "02",
      february: "02",
      mar: "03",
      march: "03",
      apr: "04",
      april: "04",
      may: "05",
      jun: "06",
      june: "06",
      jul: "07",
      july: "07",
      aug: "08",
      august: "08",
      sep: "09",
      sept: "09",
      september: "09",
      oct: "10",
      october: "10",
      nov: "11",
      november: "11",
      dec: "12",
      december: "12",
    };
    const month = monthMap[normalize(monthNamed[2])];
    const year = normalizeYear(monthNamed[3]);
    if (!month || !year) return text;
    const day = String(monthNamed[1]).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return text;
};

const isValidAadhaarNumber = (value) =>
  /^\d{12}$/.test(value) && !/^(\d)\1{11}$/.test(value);

const normalizeAadhaarCandidate = (value) =>
  String(value || "")
    .replace(/\D+/g, "")
    .trim();

const extractDateOfBirth = (text) => {
  const dob = captureFirst(text, [
    /(?:date\s*of\s*birth|dob)\s*[:\-]?\s*([0-3]?\d[\/\-][01]?\d[\/\-](?:19|20)?\d{2})/i,
    /(?:date\s*of\s*birth|dob)\s*[:\-]?\s*((?:19|20)\d{2}[\/\-][01]?\d[\/\-][0-3]?\d)/i,
    /(?:date\s*of\s*birth|dob)\s*[:\-]?\s*([0-3]?\d\s+[a-z]{3,9}\s+(?:19|20)?\d{2})/i,
    /(?:year\s*of\s*birth|yob)\s*[:\-]?\s*((?:19|20)\d{2})/i,
  ]);
  return normalizeDateValue(dob);
};

const splitCleanLines = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanValue(String(line || "").replace(/\s{2,}/g, " ")))
    .filter(Boolean);

const AADHAAR_NOISE_LINE_PATTERN =
  /\b(?:government|govt|india|uidai|aadhaar|aadhar|enrolment|enrollment|download|verify|male|female|transgender|gender|dob|date of birth|yob|mobile|phone|help|www\.|qr|barcode)\b/i;

const AADHAAR_ADDRESS_STOP_PATTERN =
  /\b(?:uidai|aadhaar|aadhar|enrolment|enrollment|download|verify|help|www\.|dob|date of birth|gender|male|female|transgender|mobile|phone|virtual id|vid)\b/i;

const looksLikeAadhaarNameLine = (line) => {
  const text = cleanValue(line);
  if (!text) return false;
  if (AADHAAR_NOISE_LINE_PATTERN.test(text)) return false;
  if (/\d/.test(text)) return false;
  if (!/[a-z]/i.test(text)) return false;
  if (text.length < 3 || text.length > 80) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 6;
};

const extractNameFromAadhaar = (text) => {
  const labeled = captureFirst(text, [
    /(?:^|\n)\s*(?:name|name of holder|name of resident)\s*[:\-]\s*([a-z][a-z .']{2,80})/im,
  ]);
  if (labeled) return labeled;

  const lines = splitCleanLines(text);
  const headerIndex = lines.findIndex((line) => /\b(?:gov(?:ernment)?\s*of\s*india|uidai)\b/i.test(line));
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  const end = Math.min(lines.length, start + 8);

  for (let index = start; index < end; index += 1) {
    const candidate = lines[index];
    if (looksLikeAadhaarNameLine(candidate)) return candidate;
  }

  for (const candidate of lines.slice(0, 12)) {
    if (looksLikeAadhaarNameLine(candidate)) return candidate;
  }

  return "";
};

const extractGender = (text) => {
  const labeled = captureFirst(text, [
    /(?:gender|sex)\s*[:\-]?\s*(male|female|transgender|other|m|f|t|o)\b/i,
  ]);
  if (labeled) return normalizeGenderValue(labeled);

  const direct = captureFirst(text, [/\b(male|female|transgender|other)\b/i]);
  return normalizeGenderValue(direct);
};

const extractYearOfBirth = (text) => {
  const direct = captureFirst(text, [/(?:year\s*of\s*birth|yob)\s*[:\-]?\s*((?:19|20)\d{2})\b/i]);
  if (direct) return normalizeYearOfBirthValue(direct);

  const dob = extractDateOfBirth(text);
  return normalizeYearOfBirthValue(dob);
};

const extractFatherName = (text) =>
  captureFirst(text, [
    /(?:father(?:'s)?\s*name)\s*[:\-]?\s*([a-z][a-z .']{2,80})/im,
    /(?:s\/o|d\/o)\s*[:\-]?\s*([a-z][a-z .']{2,80})/im,
  ]);

const extractHusbandName = (text) =>
  captureFirst(text, [
    /(?:husband(?:'s)?\s*name)\s*[:\-]?\s*([a-z][a-z .']{2,80})/im,
    /(?:w\/o)\s*[:\-]?\s*([a-z][a-z .']{2,80})/im,
  ]);

const extractGuardianName = (text) =>
  captureFirst(text, [
    /(?:guardian(?:'s)?\s*name)\s*[:\-]?\s*([a-z][a-z .']{2,80})/im,
    /(?:c\/o|care\s*of)\s*[:\-]?\s*([a-z][a-z .']{2,80})/im,
  ]);

const extractPincode = (text) => normalizePincodeValue(captureFirst(text, [/\b([1-9]\d{5})\b/]));

const extractAddressFromAadhaar = (text) => {
  const lines = splitCleanLines(text);
  if (lines.length === 0) return "";

  const blocks = [];
  const addLine = (value) => {
    const line = cleanValue(value);
    if (!line) return;
    const signature = normalize(line);
    if (!signature) return;
    if (blocks.some((existing) => normalize(existing) === signature)) return;
    blocks.push(line);
  };

  const addressIndex = lines.findIndex((line) => /\b(?:address|addr)\b/i.test(line));
  if (addressIndex >= 0) {
    for (let index = addressIndex; index < lines.length && blocks.length < 6; index += 1) {
      let current = lines[index];
      if (index === addressIndex) {
        current = current.replace(/^.*\b(?:address|addr)\b\s*[:\-]?\s*/i, "");
      }
      const hasPincode = /\b[1-9]\d{5}\b/.test(current);
      if (blocks.length > 0 && AADHAAR_ADDRESS_STOP_PATTERN.test(current) && !hasPincode) break;
      addLine(current);
    }
  }

  if (blocks.length === 0) {
    const pincodeLineIndex = lines.findIndex((line) => /\b[1-9]\d{5}\b/.test(line));
    if (pincodeLineIndex >= 0) {
      const from = Math.max(0, pincodeLineIndex - 3);
      for (let index = from; index <= pincodeLineIndex && blocks.length < 6; index += 1) {
        const current = lines[index];
        if (AADHAAR_ADDRESS_STOP_PATTERN.test(current) && !/\b[1-9]\d{5}\b/.test(current)) continue;
        addLine(current);
      }
    }
  }

  return cleanValue(blocks.join(", "));
};

const extractAddressComponents = ({ address = "", text = "" } = {}) => {
  const output = {
    address_line_1: "",
    address_line_2: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
  };

  const cleanAddress = cleanValue(address);
  if (!cleanAddress) {
    output.pincode = extractPincode(text);
    return output;
  }

  const parts = cleanAddress
    .split(/\s*,\s*/)
    .map((item) => cleanValue(item))
    .filter(Boolean);
  const uniqueParts = [];
  const seen = new Set();
  parts.forEach((part) => {
    const signature = normalize(part);
    if (!signature || seen.has(signature)) return;
    seen.add(signature);
    uniqueParts.push(part);
  });

  output.address_line_1 = cleanValue(uniqueParts.slice(0, 2).join(", "));
  output.address_line_2 = cleanValue(uniqueParts.slice(2).join(", "));
  output.pincode = extractPincode(cleanAddress) || extractPincode(text);

  const stateMatch = cleanAddress.match(STATE_NAME_PATTERN);
  if (stateMatch?.[1]) output.state = cleanValue(stateMatch[1]);

  const locationCandidates = uniqueParts.filter((part) => {
    const normalizedPart = normalize(part);
    if (!normalizedPart) return false;
    if (output.state && normalizedPart === normalize(output.state)) return false;
    if (output.pincode && part.includes(output.pincode)) return false;
    return true;
  });

  if (locationCandidates.length > 0) {
    output.city = locationCandidates[locationCandidates.length - 1];
  }
  if (locationCandidates.length > 1) {
    output.district = locationCandidates[locationCandidates.length - 2];
  } else if (output.city) {
    output.district = output.city;
  }

  return output;
};

const extractAadhaarNumber = (text) => {
  const lines = String(text || "").split(/\r?\n/);
  const keywordLinePattern = /\b(aadhaar|aadhar|uid|uidai)\b/i;
  const candidatePattern = /((?:\d[\s\-]*){12,16})/g;

  for (const line of lines) {
    if (!keywordLinePattern.test(line)) continue;
    const matches = line.match(candidatePattern) || [];
    for (const match of matches) {
      const digits = normalizeAadhaarCandidate(match);
      if (isValidAadhaarNumber(digits)) return digits;
    }
  }

  const globalMatches = String(text || "").match(candidatePattern) || [];
  for (const match of globalMatches) {
    const digits = normalizeAadhaarCandidate(match);
    if (isValidAadhaarNumber(digits)) return digits;
  }

  const fallback = normalizeAadhaarCandidate(
    captureFirst(text, [/\b(\d{4}\s?\d{4}\s?\d{4})\b/])
  );
  return isValidAadhaarNumber(fallback) ? fallback : "";
};

const extractPanNumber = (text) =>
  captureFirst(text.toUpperCase(), [/\b([A-Z]{5}[0-9]{4}[A-Z])\b/]);

const extractAddress = (text) => {
  const match = text.match(/(?:address|residential\s+address)\s*[:\-]\s*([\s\S]{8,250})/i);
  if (!match?.[1]) return "";
  let value = String(match[1]);
  value = value.split(/\n(?:dob|date of birth|gender|mobile|phone|aadhaar|uid|pan|ifsc|account)\b/i)[0];
  value = value.split(/\n{2,}/)[0];
  return cleanValue(value.replace(/\n/g, ", "));
};

const extractAnnualIncome = (text) => {
  const match =
    text.match(
      /(?:annual\s+income|income)\s*[:\-]?\s*(?:rs\.?|inr)?\s*([0-9][0-9,]{2,})(?:\s*(lakh|lakhs|lac|lacs|crore|crores|thousand|k))?/i
    ) ||
    text.match(
      /(?:rs\.?|inr)\s*([0-9][0-9,]{2,})(?:\s*(lakh|lakhs|lac|lacs|crore|crores|thousand|k))?\s*(?:per\s*annum|annual|income)/i
    );

  if (!match?.[1]) return "";
  return parseAmountToNumberString(match[1], match[2] || "");
};

const extractAccountNumber = (text) =>
  captureFirst(text, [
    /(?:account\s*(?:number|no\.?)?)\s*[:\-]?\s*([0-9]{9,20})/i,
  ]);

const extractIFSC = (text) =>
  captureFirst(text.toUpperCase(), [/\b([A-Z]{4}0[A-Z0-9]{6})\b/]);

const extractBankName = (text) =>
  captureFirst(text, [
    /(?:bank\s*name)\s*[:\-]\s*([a-z][a-z .&'-]{3,90})/im,
    /(?:^|\n)\s*([a-z][a-z .&'-]{3,90}\s+bank)\b/im,
  ]);

const extractCourse = (text) =>
  captureFirst(text, [
    /(?:course|programme|program)\s*[:\-]\s*([a-z0-9][a-z0-9 .,&()/'-]{2,100})/im,
  ]);

const extractInstitution = (text) =>
  captureFirst(text, [
    /(?:institution|college|university|school)\s*[:\-]\s*([a-z0-9][a-z0-9 .,&()/'-]{2,120})/im,
  ]);

const extractYearOfPassing = (text) =>
  captureFirst(text, [
    /(?:year\s*of\s*passing|passing\s*year)\s*[:\-]?\s*((?:19|20)\d{2})/i,
    /(?:^|\n)\s*year\s*[:\-]?\s*((?:19|20)\d{2})/im,
  ]);

const extractDisabilityType = (text) =>
  captureFirst(text, [
    /(?:type\s*of\s*disability|disability\s*type)\s*[:\-]\s*([a-z][a-z ,&()/'-]{2,100})/im,
  ]);

const extractDisabilityPercentage = (text) =>
  captureFirst(text, [
    /(?:disability\s*(?:percentage|percent)|percentage)\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)\s*%?/i,
    /\b(\d{1,3}(?:\.\d+)?)\s*%\s*(?:disability|disabled)/i,
  ]);

const extractDataByDocumentType = (text, documentSpec) => {
  const output = {};
  const assign = (key, value) => {
    const cleaned = cleanValue(value);
    if (cleaned) output[key] = cleaned;
  };

  switch (documentSpec.type) {
    case "aadhaar_card":
      {
        const aadhaarName = extractNameFromAadhaar(text) || extractName(text);
        const aadhaarDob = extractDateOfBirth(text);
        const aadhaarAddress = extractAddress(text) || extractAddressFromAadhaar(text);
        const addressParts = extractAddressComponents({
          address: aadhaarAddress,
          text,
        });

        assign("name", aadhaarName);
        assign("date_of_birth", aadhaarDob);
        assign("year_of_birth", extractYearOfBirth(text));
        assign("aadhaar_number", extractAadhaarNumber(text));
        assign("gender", extractGender(text));
        assign("father_name", extractFatherName(text));
        assign("husband_name", extractHusbandName(text));
        assign("guardian_name", extractGuardianName(text));
        assign("address", aadhaarAddress);
        assign("address_line_1", addressParts.address_line_1);
        assign("address_line_2", addressParts.address_line_2);
        assign("city", addressParts.city);
        assign("district", addressParts.district);
        assign("state", addressParts.state);
        assign("pincode", addressParts.pincode || extractPincode(text));
      }
      break;
    case "pan_card":
      assign("name", extractName(text));
      assign("pan_number", extractPanNumber(text));
      break;
    case "income_certificate":
      assign("name", extractName(text));
      assign("annual_income", extractAnnualIncome(text));
      break;
    case "bank_passbook":
      assign("name", extractName(text));
      assign("account_number", extractAccountNumber(text));
      assign("ifsc_code", extractIFSC(text));
      assign("bank_name", extractBankName(text));
      break;
    case "education_certificate":
      assign("candidate_name", extractCandidateName(text));
      assign("course", extractCourse(text));
      assign("institution", extractInstitution(text));
      assign("year_of_passing", extractYearOfPassing(text));
      break;
    case "disability_certificate":
      assign("name", extractName(text));
      assign("disability_type", extractDisabilityType(text));
      assign("disability_percentage", extractDisabilityPercentage(text));
      break;
    default:
      assign("name", extractName(text));
      assign("date_of_birth", extractDateOfBirth(text));
      assign("aadhaar_number", extractAadhaarNumber(text));
      assign("pan_number", extractPanNumber(text));
      assign("annual_income", extractAnnualIncome(text));
      assign("account_number", extractAccountNumber(text));
      assign("ifsc_code", extractIFSC(text));
      assign("bank_name", extractBankName(text));
      assign("address", extractAddress(text));
      break;
  }

  return output;
};

const extractStructuredDataFromDocument = async ({
  documentSpec,
  mimeType,
  bufferData,
}) => {
  const text = await extractTextFromDocument(bufferData, mimeType);
  if (!text) {
    return {
      text: "",
      structured_data: {},
      generic_data: {},
    };
  }
  return {
    text,
    structured_data: extractDataByDocumentType(text, documentSpec),
    generic_data: extractGenericKeyValuePairs(text),
  };
};

const hasMissingExpectedFields = (extractedData = {}, expectedFields = []) => {
  const expected = (expectedFields || []).map((field) => normalizeFieldKey(field)).filter(Boolean);
  if (expected.length === 0) return false;
  const present = new Set(Object.keys(extractedData || {}).map((key) => normalizeFieldKey(key)));
  return expected.some((field) => !present.has(field));
};

const mergeExtractionOutputs = ({ primary = {}, secondary = {}, allowedFields = [] }) =>
  sanitizeExtractedData(
    {
      ...(secondary || {}),
      ...(primary || {}),
    },
    allowedFields
  );

const buildDatabaseSchemaOutput = (record) => ({
  user_id: String(record.user_id || ""),
  document_name: record.document_name || "",
  document_url: record.cloudinary_url || "",
  extracted_data: record.extracted_data || {},
  dynamic_schema: record.dynamic_schema || {},
  uploaded_at: record.uploaded_at ? new Date(record.uploaded_at).toISOString() : "",
});

const buildProcessResponse = ({
  record,
  extractionSummary,
  requiredStatus,
  mergedSnapshot,
  extractionEngine = "",
  extractionDiagnostics = {},
  duplicateDocument = false,
  duplicateReplaced = false,
}) => ({
  document_processed: true,
  duplicate_document: duplicateDocument,
  duplicate_replaced: duplicateReplaced,
  document_name: record.document_name || "",
  cloudinary_url: record.cloudinary_url || "",
  extracted_data: record.extracted_data || {},
  autofill_fields: record.autofill_fields || {},
  dynamic_schema: record.dynamic_schema || {},
  merged_extracted_data: mergedSnapshot?.merged_extracted_data || {},
  merged_autofill_fields: mergedSnapshot?.merged_autofill_fields || {},
  merged_dynamic_schema: mergedSnapshot?.merged_dynamic_schema || {},
  extraction_engine: extractionEngine,
  extraction_diagnostics:
    extractionDiagnostics && typeof extractionDiagnostics === "object"
      ? extractionDiagnostics
      : {},
  extraction_summary: extractionSummary || buildExtractionSummary(record.extracted_data || {}, []),
  required_documents_status: requiredStatus?.required_documents || [],
  next_documents_to_upload: requiredStatus?.next_documents_to_upload || [],
  database_schema: buildDatabaseSchemaOutput(record),
});

export const processUploadedDocument = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        document_processed: false,
        message: "Unauthorized user",
      });
    }

    const schemeData = req.body?.scheme_data || req.body?.schemeData || {};
    const userProfile = req.body?.user_profile || req.body?.userProfile || {};
    const uploadEvent = req.body?.document_upload_event || req.body?.documentUploadEvent || req.body || {};

    const schemeName = String(schemeData?.scheme_name || "").trim();
    const documentName = String(uploadEvent.document_name || "").trim();
    const cloudinaryUrl = String(uploadEvent.cloudinary_url || "").trim();
    const fileType = String(uploadEvent.file_type || "").trim();

    if (!documentName || !cloudinaryUrl) {
      return res.status(400).json({
        document_processed: false,
        message: "document_name and cloudinary_url are required",
      });
    }

    if (ENFORCE_CLOUDINARY_URL && !isCloudinaryUrl(cloudinaryUrl)) {
      return res.status(400).json({
        document_processed: false,
        message: "Only Cloudinary URLs are allowed for document extraction",
      });
    }

    const requiredDocs = toStringList(schemeData?.documents_required);
    const requiredMatch = findRequiredDocMatch(documentName, requiredDocs);
    if (requiredDocs.length > 0 && !requiredMatch.matched && STRICT_REQUIRED_DOC_MATCH) {
      return res.status(400).json({
        document_processed: false,
        document_name: documentName,
        cloudinary_url: cloudinaryUrl,
        extracted_data: {},
        autofill_fields: {},
        dynamic_schema: {},
        database_schema: {
          user_id: String(userId),
          document_name: documentName,
          document_url: cloudinaryUrl,
          extracted_data: {},
          dynamic_schema: {},
          uploaded_at: "",
        },
        message: "Uploaded document does not match scheme required documents",
      });
    }

    const documentSpec = pickDocumentSpec(documentName);
    const dedupeKey = buildDedupeKey({
      documentSpec,
      matchedRequiredDocument: requiredMatch.matchedDocument,
      documentName,
    });

    const existingRecord = await UserDocument.findOne({
      user_id: userId,
      scheme_name: schemeName,
      dedupe_key: dedupeKey,
    }).lean();
    const historicalRecords = await UserDocument.find({
      user_id: userId,
    })
      .sort({ uploaded_at: -1 })
      .lean();
    const historicalSnapshot = buildMergedAutofillSnapshot(historicalRecords);

    if (existingRecord && normalize(existingRecord.cloudinary_url) === normalize(cloudinaryUrl)) {
      const cachedRecord = hydrateRecordWithDynamicSchema(existingRecord, {
        extractionEngine: "duplicate_cached",
      });
      const uploadedRecords = await UserDocument.find({
        user_id: userId,
        scheme_name: schemeName,
      })
        .sort({ uploaded_at: -1 })
        .lean();
      const requiredStatus = buildRequiredDocumentsStatus(requiredDocs, uploadedRecords);
      const allUserRecords = await UserDocument.find({
        user_id: userId,
      })
        .sort({ uploaded_at: -1 })
        .lean();
      const mergedSnapshot = buildMergedAutofillSnapshot(allUserRecords);
      return res
        .status(200)
        .json(
          buildProcessResponse({
            record: cachedRecord,
            extractionSummary: buildExtractionSummary(cachedRecord.extracted_data, documentSpec.fields),
            requiredStatus,
            mergedSnapshot,
            extractionEngine: "duplicate_cached",
            duplicateDocument: true,
            duplicateReplaced: false,
          })
        );
    }

    const { mimeType, bufferData } = await fetchDocumentBinary(cloudinaryUrl, fileType);

    const geminiResult = await extractStructuredDataWithGemini({
      documentName,
      requiredDocumentMatch: requiredMatch.matchedDocument,
      mimeType,
      bufferData,
      allowedFields: documentSpec.fields,
      preferredAdditionalFields: documentSpec.preferred_additional_fields || [],
      schemeData,
      userProfile,
      existingAutofillContext: historicalSnapshot,
    });

    let geminiCoreExtractedData = sanitizeExtractedData(
      geminiResult.extracted_data || {},
      documentSpec.fields
    );
    let geminiAdditionalData = sanitizeExtractedData(geminiResult.additional_data || {}, []);
    let heuristicCoreExtractedData = {};
    let heuristicAdditionalData = {};
    let heuristicText = "";
    let geminiTextResult = {
      success: false,
      extracted_data: {},
      additional_data: {},
      mode_used: "",
    };

    if (
      !geminiResult.success ||
      hasMissingExpectedFields(geminiCoreExtractedData, documentSpec.fields) ||
      documentSpec.type === "generic_document"
    ) {
      const heuristicRaw = await extractStructuredDataFromDocument({
        documentSpec,
        mimeType,
        bufferData,
      });
      heuristicText = String(heuristicRaw.text || "");
      heuristicCoreExtractedData = sanitizeExtractedData(
        heuristicRaw.structured_data || {},
        documentSpec.fields
      );
      heuristicAdditionalData = sanitizeExtractedData(
        {
          ...(heuristicRaw.generic_data || {}),
          ...(heuristicRaw.structured_data || {}),
        },
        []
      );

      const shouldRetryGeminiFromText =
        heuristicText &&
        (
          !geminiResult.success ||
          hasMissingExpectedFields(geminiCoreExtractedData, documentSpec.fields) ||
          Object.keys(geminiAdditionalData).length === 0
        );
      if (shouldRetryGeminiFromText) {
        geminiTextResult = await extractStructuredDataWithGemini({
          documentName,
          requiredDocumentMatch: requiredMatch.matchedDocument,
          mimeType: "",
          bufferData: null,
          documentText: heuristicText,
          allowedFields: documentSpec.fields,
          preferredAdditionalFields: documentSpec.preferred_additional_fields || [],
          schemeData,
          userProfile,
          existingAutofillContext: historicalSnapshot,
        });
      }
    }

    const geminiTextCoreExtractedData = sanitizeExtractedData(
      geminiTextResult.extracted_data || {},
      documentSpec.fields
    );
    const geminiTextAdditionalData = sanitizeExtractedData(
      geminiTextResult.additional_data || {},
      []
    );
    geminiCoreExtractedData = mergeExtractionOutputs({
      primary: geminiCoreExtractedData,
      secondary: geminiTextCoreExtractedData,
      allowedFields: documentSpec.fields,
    });
    geminiAdditionalData = mergeExtractionOutputs({
      primary: geminiAdditionalData,
      secondary: geminiTextAdditionalData,
      allowedFields: [],
    });

    const strictExtractedData = normalizeExtractedDataForStorage(
      mergeExtractionOutputs({
        primary: geminiCoreExtractedData,
        secondary: heuristicCoreExtractedData,
        allowedFields: documentSpec.fields,
      })
    );
    const extractedData = normalizeExtractedDataForStorage(
      mergeExtractionOutputs({
        primary: mergeExtractionOutputs({
          primary: {
            ...(geminiAdditionalData || {}),
            ...(strictExtractedData || {}),
          },
          secondary: {},
          allowedFields: [],
        }),
        secondary: heuristicAdditionalData,
        allowedFields: [],
      })
    );
    const hasGeminiData =
      Object.keys(geminiCoreExtractedData).length > 0 ||
      Object.keys(geminiAdditionalData).length > 0;
    const hasHeuristicData =
      Object.keys(heuristicCoreExtractedData).length > 0 ||
      Object.keys(heuristicAdditionalData).length > 0;
    const extractionEngine =
      hasGeminiData && hasHeuristicData && geminiTextResult.success
        ? "hybrid_gemini_text_plus_ocr"
        : hasGeminiData && hasHeuristicData
          ? "hybrid_gemini_plus_ocr"
        : hasGeminiData
          ? geminiTextResult.success
            ? "gemini_text"
            : "gemini"
          : "ocr_regex";
    const extractionDiagnostics = {
      required_match_relaxed:
        requiredDocs.length > 0 && !requiredMatch.matched && !STRICT_REQUIRED_DOC_MATCH,
      required_match_found: Boolean(requiredMatch.matched),
      required_match_name: String(requiredMatch.matchedDocument || ""),
      gemini_binary_success: Boolean(geminiResult.success),
      gemini_binary_model: String(geminiResult.model_used || ""),
      gemini_binary_mode: String(geminiResult.mode_used || ""),
      gemini_binary_reason: String(geminiResult.reason || ""),
      gemini_text_success: Boolean(geminiTextResult.success),
      gemini_text_model: String(geminiTextResult.model_used || ""),
      gemini_text_mode: String(geminiTextResult.mode_used || ""),
      gemini_text_reason: String(geminiTextResult.reason || ""),
      heuristic_text_found: Boolean(String(heuristicText || "").trim()),
      extracted_keys_count: Object.keys(extractedData || {}).length,
    };
    const extractionSummary = buildExtractionSummary(strictExtractedData, documentSpec.fields);
    const extractionFailedForKnownDoc =
      REJECT_EMPTY_EXTRACTION &&
      documentSpec.type !== "generic_document" &&
      Object.keys(strictExtractedData).length === 0;

    if (extractionFailedForKnownDoc) {
      return res.status(422).json({
        document_processed: false,
        document_name: documentName,
        cloudinary_url: cloudinaryUrl,
        extracted_data: {},
        autofill_fields: {},
        dynamic_schema: {},
        extraction_diagnostics: extractionDiagnostics,
        extraction_summary: extractionSummary,
        database_schema: {
          user_id: String(userId),
          document_name: documentName,
          document_url: cloudinaryUrl,
          extracted_data: {},
          dynamic_schema: {},
          uploaded_at: "",
        },
        message: "No relevant data extracted. Upload a clearer or correct document.",
      });
    }

    const baseAutofillFields = mapAutofillFields(extractedData);
    const dynamicSchema = buildDynamicAutofillSchema({
      documentName,
      documentSpec,
      extractedData,
      autofillFields: baseAutofillFields,
      extractionEngine,
      generatedAt: new Date(),
    });
    const autofillFields = mergeAutofillPayloads(
      baseAutofillFields,
      dynamicSchema.autofill_payload || {}
    );

    const payload = {
      user_id: userId,
      scheme_name: schemeName,
      document_name: documentName,
      cloudinary_url: cloudinaryUrl,
      file_type: fileType || mimeType,
      extracted_data: extractedData,
      autofill_fields: autofillFields,
      dynamic_schema: dynamicSchema,
      dedupe_key: dedupeKey,
      is_required_for_scheme: requiredDocs.length > 0,
      required_document_match: requiredMatch.matchedDocument || "",
      uploaded_at: new Date(),
    };

    const savedRecord = existingRecord
      ? await UserDocument.findByIdAndUpdate(existingRecord._id, payload, { new: true })
      : await UserDocument.create(payload);
    const hydratedSavedRecord = hydrateRecordWithDynamicSchema(savedRecord, {
      extractionEngine,
    });

    const uploadedRecords = await UserDocument.find({
      user_id: userId,
      scheme_name: schemeName,
    })
      .sort({ uploaded_at: -1 })
      .lean();
    const requiredStatus = buildRequiredDocumentsStatus(requiredDocs, uploadedRecords);
    const allUserRecords = await UserDocument.find({
      user_id: userId,
    })
      .sort({ uploaded_at: -1 })
      .lean();
    const mergedSnapshot = buildMergedAutofillSnapshot(allUserRecords);

    return res
      .status(200)
      .json(
        buildProcessResponse({
          record: hydratedSavedRecord,
          extractionSummary,
          requiredStatus,
          mergedSnapshot,
          extractionEngine,
          extractionDiagnostics,
          duplicateDocument: false,
          duplicateReplaced: Boolean(existingRecord),
        })
      );
  } catch (error) {
    return res.status(500).json({
      document_processed: false,
      message: "Failed to process document",
      error: error.message,
    });
  }
};

export const uploadAndProcessDocument = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        document_processed: false,
        message: "Unauthorized user",
      });
    }

    const file = req.file;
    if (!file?.buffer || file.buffer.length === 0) {
      return res.status(400).json({
        document_processed: false,
        message: "file is required in multipart/form-data",
      });
    }
    if (file.buffer.length > MAX_DOCUMENT_BYTES) {
      return res.status(400).json({
        document_processed: false,
        message: `File size exceeds ${MAX_DOCUMENT_BYTES} bytes`,
      });
    }

    let schemeData = parseJsonObject(req.body?.scheme_data || req.body?.schemeData, {});
    if (Object.keys(schemeData).length === 0) {
      const documentsRequired = toStringList(req.body?.documents_required || req.body?.documentsRequired);
      schemeData = {
        scheme_name: String(req.body?.scheme_name || req.body?.schemeName || "").trim(),
        documents_required: documentsRequired,
      };
    }

    let userProfile = parseJsonObject(req.body?.user_profile || req.body?.userProfile, {});
    if (Object.keys(userProfile).length === 0) {
      userProfile = {
        name: String(req.body?.name || "").trim(),
        date_of_birth: String(req.body?.date_of_birth || req.body?.dob || "").trim(),
        age: String(req.body?.age || "").trim(),
        gender: String(req.body?.gender || "").trim(),
        occupation: String(req.body?.occupation || "").trim(),
        income: String(req.body?.income || req.body?.annual_income || "").trim(),
        state: String(req.body?.state || "").trim(),
        category: String(req.body?.category || "").trim(),
        aadhaar_number: String(req.body?.aadhaar_number || "").trim(),
        pan_number: String(req.body?.pan_number || "").trim(),
        bank_account: String(req.body?.bank_account || "").trim(),
        ifsc_code: String(req.body?.ifsc_code || "").trim(),
        address: String(req.body?.address || "").trim(),
        email: String(req.body?.email || "").trim(),
        phone: String(req.body?.phone || "").trim(),
      };
    }

    const uploadEventRaw = parseJsonObject(req.body?.document_upload_event || req.body?.documentUploadEvent, {});
    const documentName = String(req.body?.document_name || uploadEventRaw?.document_name || "").trim();
    if (!documentName) {
      return res.status(400).json({
        document_processed: false,
        message: "document_name is required",
      });
    }

    const cloudinaryUpload = await uploadFileBufferToCloudinary({
      bufferData: file.buffer,
      mimeType: file.mimetype || "application/octet-stream",
      fileName: file.originalname || `${documentName}.bin`,
    });

    const forwardedReq = {
      ...req,
      body: {
        scheme_data: schemeData,
        user_profile: userProfile,
        document_upload_event: {
          document_name: documentName,
          cloudinary_url: cloudinaryUpload.secure_url,
          file_type: String(req.body?.file_type || file.mimetype || "").trim(),
        },
      },
    };

    return processUploadedDocument(forwardedReq, res);
  } catch (error) {
    return res.status(500).json({
      document_processed: false,
      message: "Failed to upload to Cloudinary and process document",
      error: error.message,
    });
  }
};

export const getMyProcessedDocuments = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const records = await UserDocument.find({ user_id: userId })
      .sort({ uploaded_at: -1 })
      .lean();
    const hydratedRecords = records.map((record) =>
      hydrateRecordWithDynamicSchema(record, { extractionEngine: "documents_my" })
    );
    const mergedSnapshot = buildMergedAutofillSnapshot(hydratedRecords);

    return res.status(200).json({
      success: true,
      total_documents: hydratedRecords.length,
      merged_extracted_data: mergedSnapshot.merged_extracted_data,
      merged_autofill_fields: mergedSnapshot.merged_autofill_fields,
      merged_dynamic_schema: mergedSnapshot.merged_dynamic_schema,
      autofill_context: {
        user_id: String(userId),
        extracted_data: mergedSnapshot.merged_extracted_data,
        autofill_fields: mergedSnapshot.merged_autofill_fields,
        dynamic_schema: mergedSnapshot.merged_dynamic_schema,
      },
      documents: hydratedRecords.map((record) => ({
        document_name: record.document_name || "",
        cloudinary_url: record.cloudinary_url || "",
        extracted_data: record.extracted_data || {},
        autofill_fields: record.autofill_fields || {},
        dynamic_schema: record.dynamic_schema || {},
        database_schema: buildDatabaseSchemaOutput(record),
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch documents",
      error: error.message,
    });
  }
};

export const getRequiredDocumentStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const schemeData = req.body?.scheme_data || req.body?.schemeData || req.body || {};
    const schemeName = String(schemeData?.scheme_name || "").trim();
    const requiredDocs = toStringList(schemeData?.documents_required);

    if (requiredDocs.length === 0) {
      return res.status(400).json({
        success: false,
        message: "scheme_data.documents_required is required",
      });
    }

    const query = { user_id: userId };
    if (schemeName) query.scheme_name = schemeName;

    const records = await UserDocument.find(query).sort({ uploaded_at: -1 }).lean();
    const requiredStatus = buildRequiredDocumentsStatus(requiredDocs, records);

    return res.status(200).json({
      success: true,
      scheme_name: schemeName,
      required_documents: requiredStatus.required_documents,
      next_documents_to_upload: requiredStatus.next_documents_to_upload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch required document status",
      error: error.message,
    });
  }
};
