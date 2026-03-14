const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PRIMARY_MODEL = process.env.AGNO_MODEL_ID || "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";
const GEMINI_DOC_TIMEOUT_MS = Number(process.env.GEMINI_DOC_TIMEOUT_MS || 15000);
const EXTRA_FALLBACK_MODELS = String(process.env.GEMINI_DOC_FALLBACK_MODELS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const uniqueModels = (items = []) => {
  const seen = new Set();
  const output = [];
  items.forEach((item) => {
    const value = String(item || "").trim();
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    output.push(value);
  });
  return output;
};

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

const FIELD_KEY_ALIASES = {
  name: ["full_name", "applicant_name", "beneficiary_name"],
  candidate_name: ["student_name"],
  date_of_birth: ["dob", "birth_date", "year_of_birth", "yob"],
  aadhaar_number: ["aadhaar", "aadhar", "aadhaar_no", "aadhaar_num", "uid", "uid_number"],
  gender: ["sex"],
  year_of_birth: ["yob", "birth_year"],
  father_name: ["father_s_name", "father", "s_o", "d_o"],
  husband_name: ["husband_s_name", "spouse_name", "w_o"],
  guardian_name: ["care_of", "c_o", "guardian", "parent_name"],
  address: ["residential_address", "permanent_address", "communication_address"],
  pincode: ["pin_code", "postal_code", "zip_code"],
  city: ["town"],
  district: ["zilla"],
  state: ["state_name"],
  pan_number: ["pan", "pan_no", "pan_num"],
  annual_income: ["income", "family_income", "household_income"],
  account_number: ["bank_account", "bank_account_number", "account_no", "ac_no"],
  ifsc_code: ["ifsc", "ifsc_no"],
  institution: ["institution_name", "college_name", "university_name", "school_name"],
  disability_percentage: ["disability_percent", "percentage"],
};

const cleanValue = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:,\-]+|[\s,;.\-]+$/g, "")
    .trim();

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

const resolveAllowedFieldKey = (normalizedInputKey, allowedMap = new Map()) => {
  if (!normalizedInputKey) return "";
  if (allowedMap.has(normalizedInputKey)) return allowedMap.get(normalizedInputKey);
  for (const [allowedKey] of allowedMap.entries()) {
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

  const allowedMap = new Map();
  (allowedFields || []).forEach((field) => {
    const key = normalizeFieldKey(field);
    if (key) allowedMap.set(key, String(field).trim());
  });

  const strictAllowed = allowedMap.size > 0;
  const sanitized = {};

  Object.entries(source).forEach(([key, value]) => {
    const normalizedKey = normalizeFieldKey(key);
    const outputKey = strictAllowed
      ? resolveAllowedFieldKey(normalizedKey, allowedMap)
      : normalizedKey;
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

const buildPrompt = ({
  documentName,
  allowedFields,
  preferredAdditionalFields,
  requiredDocumentMatch,
  schemeData,
  userProfile,
  existingAutofillContext,
}) => {
  const strictFields = (allowedFields || []).map((field) => String(field).trim()).filter(Boolean);
  const preferredFields = (preferredAdditionalFields || [])
    .map((field) => String(field).trim())
    .filter(Boolean);

  const contextPayload = {
    document_name: documentName || "",
    matched_required_document: requiredDocumentMatch || "",
    scheme_data: {
      scheme_name: schemeData?.scheme_name || "",
      documents_required: Array.isArray(schemeData?.documents_required)
        ? schemeData.documents_required
        : [],
    },
    user_profile: {
      user_id: userProfile?.user_id || "",
      name: userProfile?.name || "",
      email: userProfile?.email || "",
      phone: userProfile?.phone || "",
      address: userProfile?.address || "",
      age: userProfile?.age || "",
      gender: userProfile?.gender || "",
      occupation: userProfile?.occupation || "",
      income: userProfile?.income || "",
      state: userProfile?.state || "",
      category: userProfile?.category || "",
    },
    existing_schema_context: {
      extracted_data:
        existingAutofillContext?.merged_extracted_data &&
        typeof existingAutofillContext.merged_extracted_data === "object"
          ? existingAutofillContext.merged_extracted_data
          : {},
      autofill_fields:
        existingAutofillContext?.merged_autofill_fields &&
        typeof existingAutofillContext.merged_autofill_fields === "object"
          ? existingAutofillContext.merged_autofill_fields
          : {},
    },
    allowed_fields: strictFields,
    preferred_additional_fields: preferredFields,
  };

  const allowedFieldsLine =
    strictFields.length > 0 ? strictFields.join(", ") : "No strict field list provided";
  const preferredAdditionalLine =
    preferredFields.length > 0 ? preferredFields.join(", ") : "No preferred additional fields provided";

  return `
You are an AI document extraction agent for government scheme applications.

Task:
1. Read the attached document and extract only fields that are clearly visible in the document.
2. Never infer, guess, or fabricate values.
3. Prioritize these allowed fields in "extracted_data": ${allowedFieldsLine}
4. Also prioritize these additional fields in "additional_data" when visible: ${preferredAdditionalLine}
5. If you see other visible key-value data outside allowed fields, return them in "additional_data".
6. If a field is not visible, omit it.
7. Keep original document truth as source of value. Existing schema context is for key understanding only.
8. For aadhaar_number, output exactly 12 digits without spaces/hyphens.
9. For pan_number, output uppercase in standard PAN format.
10. For date_of_birth, prefer YYYY-MM-DD when clearly readable.
11. For Aadhaar documents, include gender, guardian/father/husband name, and address parts (city/district/state/pincode) if clearly visible.
12. Return valid JSON only.

Return exactly:
{
  "extracted_data": {
    "field_name": "value"
  },
  "additional_data": {
    "extra_field_name": "value"
  }
}

Input context:
${JSON.stringify(contextPayload)}
`.trim();
};

const buildTextModePrompt = ({ basePrompt, documentText = "" }) => {
  const text = String(documentText || "").trim();
  const clipped = text.length > 20000 ? text.slice(0, 20000) : text;
  return `
${basePrompt}

OCR text from document:
"""
${clipped}
"""
`.trim();
};

const extractTextFromGeminiPayload = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => String(part?.text || "").trim())
    .filter(Boolean)
    .join("\n");
};

const callGemini = async (modelId, prompt, mimeType, bufferData) => {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_DOC_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: bufferData.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const rawText = extractTextFromGeminiPayload(payload);
  const parsed = safeJsonParse(rawText);
  if (!parsed) {
    throw new Error("Gemini returned non-JSON output");
  }
  return parsed;
};

const callGeminiTextOnly = async (modelId, prompt) => {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_DOC_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const rawText = extractTextFromGeminiPayload(payload);
  const parsed = safeJsonParse(rawText);
  if (!parsed) {
    throw new Error("Gemini returned non-JSON output");
  }
  return parsed;
};

export const extractStructuredDataWithGemini = async ({
  documentName,
  requiredDocumentMatch,
  mimeType,
  bufferData,
  documentText = "",
  allowedFields = [],
  preferredAdditionalFields = [],
  schemeData = {},
  userProfile = {},
  existingAutofillContext = {},
}) => {
  if (!GEMINI_API_KEY) {
    return {
      success: false,
      extracted_data: {},
      additional_data: {},
      reason: "GEMINI_API_KEY missing",
    };
  }

  const binaryPrompt = buildPrompt({
    documentName,
    allowedFields,
    preferredAdditionalFields,
    requiredDocumentMatch,
    schemeData,
    userProfile,
    existingAutofillContext,
  });
  const textPrompt = buildTextModePrompt({
    basePrompt: binaryPrompt,
    documentText,
  });

  const models = uniqueModels([PRIMARY_MODEL, ...EXTRA_FALLBACK_MODELS, FALLBACK_MODEL]);
  const hasBinaryPayload = Boolean(mimeType && bufferData && bufferData.length > 0);
  const hasTextPayload = String(documentText || "").trim().length > 0;
  let lastReason = "Gemini extraction failed";

  for (const model of models) {
    if (hasBinaryPayload) {
      try {
        const raw = await callGemini(model, binaryPrompt, mimeType, bufferData);
        const rawExtractedData =
          raw?.extracted_data && typeof raw.extracted_data === "object" ? raw.extracted_data : raw;
        const rawAdditionalData =
          raw?.additional_data && typeof raw.additional_data === "object" ? raw.additional_data : {};
        const extractedData = sanitizeExtractedData(rawExtractedData, allowedFields);
        const additionalData = sanitizeExtractedData(rawAdditionalData, []);
        return {
          success: true,
          extracted_data: extractedData,
          additional_data: additionalData,
          model_used: model,
          mode_used: "binary_document",
        };
      } catch (error) {
        lastReason = error?.message || "Gemini binary extraction failed";
      }
    }

    if (!hasTextPayload) continue;
    try {
      const raw = await callGeminiTextOnly(model, textPrompt);
      const rawExtractedData =
        raw?.extracted_data && typeof raw.extracted_data === "object" ? raw.extracted_data : raw;
      const rawAdditionalData =
        raw?.additional_data && typeof raw.additional_data === "object" ? raw.additional_data : {};
      const extractedData = sanitizeExtractedData(rawExtractedData, allowedFields);
      const additionalData = sanitizeExtractedData(rawAdditionalData, []);
      return {
        success: true,
        extracted_data: extractedData,
        additional_data: additionalData,
        model_used: model,
        mode_used: "ocr_text",
      };
    } catch (error) {
      lastReason = error?.message || "Gemini text extraction failed";
    }
  }

  return {
    success: false,
    extracted_data: {},
    additional_data: {},
    reason: lastReason || "Gemini extraction failed",
  };
};
