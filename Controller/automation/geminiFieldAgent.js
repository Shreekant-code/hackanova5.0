const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PRIMARY_MODEL = process.env.AGNO_MODEL_ID || "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";
const GEMINI_TIMEOUT_MS = Number(process.env.AUTOMATION_GEMINI_TIMEOUT_MS || 12000);
const ENABLE_GEMINI_FIELD_MAPPING = /^(1|true|yes)$/i.test(
  String(process.env.AUTOMATION_ENABLE_GEMINI_FIELD_MAPPING || "true")
);

const DEFAULT_ALLOWED_SOURCE_KEYS = [
  "name",
  "date_of_birth",
  "age",
  "gender",
  "occupation",
  "income",
  "state",
  "city",
  "district",
  "pincode",
  "category",
  "aadhaar_number",
  "eshram_uan",
  "vid_number",
  "verification_type",
  "pan_number",
  "bank_account",
  "ifsc_code",
  "email",
  "phone",
  "address",
  "address_line_1",
  "address_line_2",
  "father_name",
  "husband_name",
  "guardian_name",
  "password",
  "confirm_password",
];

const SOURCE_KEY_ALIASES = {
  applicant_name: "name",
  candidate_name: "name",
  beneficiary_name: "name",
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
  portal_email: "email",
  login_email: "email",
  registered_email: "email",
  portal_password: "password",
};

const normalizeKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

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

const resolveKey = (value = "") => {
  const normalized = normalizeKey(value);
  if (!normalized) return "";
  return normalizeKey(SOURCE_KEY_ALIASES[normalized] || normalized);
};

const truncate = (value, max = 64) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const ensureSchemaEntry = (schemaMap, canonicalKey = "") => {
  const canonical = resolveKey(canonicalKey);
  if (!canonical) return null;
  if (!schemaMap.has(canonical)) {
    schemaMap.set(canonical, {
      source_key: canonical,
      aliases: new Set([canonical, canonical.replace(/_/g, " ")]),
      sample_values: new Set(),
      from: new Set(),
    });
  }
  return schemaMap.get(canonical);
};

const registerSchemaHint = ({ schemaMap, key = "", alias = "", source = "", sampleValue = "" }) => {
  const entry = ensureSchemaEntry(schemaMap, key || alias);
  if (!entry) return;

  const aliasKey = normalizeKey(alias || key);
  if (aliasKey) {
    entry.aliases.add(aliasKey);
    entry.aliases.add(aliasKey.replace(/_/g, " "));
  }

  const sourceLabel = String(source || "").trim();
  if (sourceLabel) entry.from.add(sourceLabel);

  const sample = truncate(sampleValue, 56);
  if (sample) entry.sample_values.add(sample);
};

const buildSchemaContext = ({
  userProfile = {},
  userData = {},
  profileData = {},
  portalCredentials = {},
  documents = [],
}) => {
  const schemaMap = new Map();

  DEFAULT_ALLOWED_SOURCE_KEYS.forEach((key) => {
    registerSchemaHint({
      schemaMap,
      key,
      alias: key,
      source: "base_mapper",
    });
  });

  collectScalarEntries(userData).forEach(([key, value]) => {
    registerSchemaHint({
      schemaMap,
      key,
      alias: key,
      source: "login_database",
      sampleValue: value,
    });
  });

  collectScalarEntries(profileData).forEach(([key, value]) => {
    registerSchemaHint({
      schemaMap,
      key,
      alias: key,
      source: "profile_database",
      sampleValue: value,
    });
  });

  collectScalarEntries(userProfile).forEach(([key, value]) => {
    registerSchemaHint({
      schemaMap,
      key,
      alias: key,
      source: "profile_database",
      sampleValue: value,
    });
  });

  if (toScalarText(portalCredentials?.email)) {
    registerSchemaHint({
      schemaMap,
      key: "email",
      alias: "portal_email",
      source: "login_database",
      sampleValue: portalCredentials.email,
    });
  }
  if (toScalarText(portalCredentials?.password)) {
    registerSchemaHint({
      schemaMap,
      key: "password",
      alias: "portal_password",
      source: "login_database",
      sampleValue: "***",
    });
    registerSchemaHint({
      schemaMap,
      key: "confirm_password",
      alias: "confirm_portal_password",
      source: "login_database",
      sampleValue: "***",
    });
  }

  (Array.isArray(documents) ? documents : []).forEach((doc) => {
    const extractedData = doc?.extracted_data && typeof doc.extracted_data === "object" ? doc.extracted_data : {};
    const autofillFields =
      doc?.autofill_fields && typeof doc.autofill_fields === "object" ? doc.autofill_fields : {};
    const dynamicSchema =
      doc?.dynamic_schema && typeof doc.dynamic_schema === "object" ? doc.dynamic_schema : {};

    collectScalarEntries(extractedData).forEach(([key, value]) => {
      registerSchemaHint({
        schemaMap,
        key,
        alias: key,
        source: "extraction_database_schema",
        sampleValue: value,
      });
    });

    collectScalarEntries(autofillFields).forEach(([key, value]) => {
      registerSchemaHint({
        schemaMap,
        key,
        alias: key,
        source: "extraction_database_schema",
        sampleValue: value,
      });
    });

    collectScalarEntries(dynamicSchema?.autofill_payload || {}).forEach(([key, value]) => {
      registerSchemaHint({
        schemaMap,
        key,
        alias: key,
        source: "extraction_database_schema",
        sampleValue: value,
      });
    });

    const schemaFields = Array.isArray(dynamicSchema?.fields) ? dynamicSchema.fields : [];
    schemaFields.forEach((schemaField) => {
      const canonical = normalizeKey(
        schemaField?.canonical_key || schemaField?.source_key || schemaField?.key || ""
      );
      const aliases = Array.isArray(schemaField?.aliases) ? schemaField.aliases : [];
      const sourceKeys = Array.isArray(schemaField?.source_keys) ? schemaField.source_keys : [];

      registerSchemaHint({
        schemaMap,
        key: canonical,
        alias: canonical,
        source: "extraction_database_schema",
        sampleValue: schemaField?.value || "",
      });

      [...aliases, ...sourceKeys].forEach((alias) => {
        registerSchemaHint({
          schemaMap,
          key: canonical || alias,
          alias,
          source: "extraction_database_schema",
          sampleValue: schemaField?.value || "",
        });
      });
    });
  });

  const schemaHints = Array.from(schemaMap.values())
    .map((entry) => ({
      source_key: entry.source_key,
      aliases: Array.from(entry.aliases).filter(Boolean).slice(0, 24),
      sample_values: Array.from(entry.sample_values).filter(Boolean).slice(0, 4),
      from: Array.from(entry.from).filter(Boolean),
    }))
    .sort((a, b) => a.source_key.localeCompare(b.source_key));

  const allowedSourceKeys = Array.from(
    new Set([
      ...DEFAULT_ALLOWED_SOURCE_KEYS,
      ...schemaHints.map((entry) => entry.source_key).filter(Boolean),
    ])
  );

  return {
    allowedSourceKeys,
    schemaHints,
  };
};

const safeJsonParse = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  const text = String(value).trim();

  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // continue
    }
  }

  const firstArray = text.match(/\[[\s\S]*\]/);
  if (firstArray?.[0]) {
    try {
      return JSON.parse(firstArray[0]);
    } catch {
      return null;
    }
  }

  const firstObject = text.match(/\{[\s\S]*\}/);
  if (firstObject?.[0]) {
    try {
      return JSON.parse(firstObject[0]);
    } catch {
      return null;
    }
  }

  return null;
};

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);

const buildPrompt = ({ forms = [], allowedSourceKeys = [], schemaHints = [] }) => {
  const fields = (forms || []).flatMap((form) =>
    (form?.fields || []).map((field) => ({
      selector: field?.id ? `#${field.id}` : field?.name ? `[name="${field.name}"]` : "",
      label: field?.label || "",
      name: field?.name || "",
      id: field?.id || "",
      placeholder: field?.placeholder || "",
      type: field?.type || "",
      tag: field?.tag || "",
      form_kind: form?.form_kind || "unknown",
    }))
  );

  return `
You are an AI field mapping agent for government forms.
Map each form field selector to one source_key from allowed keys.
Use only high-confidence mappings.

Important:
- Match using label, placeholder, name, and id together.
- Prioritize database schema hints from login, profile, and extraction schemas.
- If a field is ambiguous or no strong alias match exists, skip it.
- Never guess sensitive mappings (aadhaar, pan, bank, ifsc, dob, phone, email).

Allowed source_key values:
${JSON.stringify(allowedSourceKeys)}

Database schema context:
${JSON.stringify(schemaHints)}

Return strict JSON array:
[
  {
    "selector": "#fieldId or [name=\\"field_name\\"]",
    "source_key": "name",
    "confidence": 0.95
  }
]

Form fields:
${JSON.stringify(fields)}
`.trim();
};

const callGemini = async (modelId, prompt) => {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const payload = await withTimeout(
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    }),
    GEMINI_TIMEOUT_MS,
    "Gemini field mapping timeout"
  );

  if (!payload.ok) {
    const body = await payload.text();
    throw new Error(`Gemini API ${payload.status}: ${body}`);
  }
  const json = await payload.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = safeJsonParse(text);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.mappings)) return parsed.mappings;
  return [];
};

export const inferFieldMappingsWithGemini = async ({
  forms = [],
  userProfile = {},
  userData = {},
  profileData = {},
  documents = [],
  portalCredentials = {},
}) => {
  if (!ENABLE_GEMINI_FIELD_MAPPING || !GEMINI_API_KEY) return [];

  const schemaContext = buildSchemaContext({
    userProfile,
    userData,
    profileData,
    portalCredentials,
    documents,
  });

  const prompt = buildPrompt({
    forms,
    allowedSourceKeys: schemaContext.allowedSourceKeys,
    schemaHints: schemaContext.schemaHints,
  });

  const models = PRIMARY_MODEL === FALLBACK_MODEL ? [PRIMARY_MODEL] : [PRIMARY_MODEL, FALLBACK_MODEL];

  for (const model of models) {
    try {
      const output = await callGemini(model, prompt);
      return output
        .map((item) => ({
          selector: String(item?.selector || "").trim(),
          source_key: String(item?.source_key || "").trim(),
          confidence: Number(item?.confidence || 0),
        }))
        .filter((item) => item.selector && item.source_key && item.confidence > 0);
    } catch {
      // try fallback model
    }
  }
  return [];
};

