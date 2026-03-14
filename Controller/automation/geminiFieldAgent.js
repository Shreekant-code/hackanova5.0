const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PRIMARY_MODEL = process.env.AGNO_MODEL_ID || "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";
const GEMINI_TIMEOUT_MS = Number(process.env.AUTOMATION_GEMINI_TIMEOUT_MS || 12000);
const ENABLE_GEMINI_FIELD_MAPPING = /^(1|true|yes)$/i.test(
  String(process.env.AUTOMATION_ENABLE_GEMINI_FIELD_MAPPING || "true")
);

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

const buildPrompt = ({ forms = [] }) => {
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

  const allowedSourceKeys = [
    "name",
    "date_of_birth",
    "age",
    "gender",
    "occupation",
    "income",
    "state",
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
    "password",
    "confirm_password",
  ];

  return `
You are an AI field mapping agent.
Map each form field selector to one source_key from allowed keys.
Only return a mapping when confidence is high and meaning is clear.
Do not guess uncertain mappings.

Allowed source_key values:
${JSON.stringify(allowedSourceKeys)}

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

export const inferFieldMappingsWithGemini = async ({ forms = [] }) => {
  if (!ENABLE_GEMINI_FIELD_MAPPING || !GEMINI_API_KEY) return [];
  const prompt = buildPrompt({ forms });
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
