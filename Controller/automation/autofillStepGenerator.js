import { buildFieldMappings } from "./fieldMapper.js";
import { resolveRequiredDocumentMatches } from "./documentMapper.js";

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const AUTH_KEYWORDS = [
  "login",
  "log in",
  "sign in",
  "username",
  "user id",
  "password",
  "otp",
  "one time password",
];

const CAPTCHA_KEYWORDS = ["captcha", "recaptcha", "hcaptcha", "i am not a robot"];

const toList = (value) => (Array.isArray(value) ? value : []);

const normalizeType = (typeValue) => {
  const type = normalize(typeValue);
  if (!type) return "text";
  if (type.includes("file")) return "file";
  if (type.includes("select") || type.includes("dropdown")) return "select";
  if (type.includes("textarea")) return "textarea";
  return type;
};

const toSafeFieldName = (value, index) => {
  const raw = normalize(value).replace(/\s+/g, "_");
  return raw || `field_${index + 1}`;
};

const coerceFormFields = (fields = []) =>
  toList(fields).map((field, index) => {
    const label = String(field?.label || "").trim();
    const name = String(field?.name || "").trim() || toSafeFieldName(label, index);
    const id = String(field?.id || "").trim();
    const selector = String(field?.selector || "").trim();
    const type = normalizeType(field?.type);
    const tag = type === "select" ? "select" : type === "textarea" ? "textarea" : "input";
    const options = toList(field?.options).map((option) => ({
      label: String(option?.label ?? option ?? "").trim(),
      value: String(option?.value ?? option ?? "").trim(),
    }));

    return {
      label,
      name,
      id,
      selector,
      type,
      tag,
      placeholder: String(field?.placeholder || "").trim(),
      required: Boolean(field?.required),
      options,
    };
  });

const hasAnyKeyword = (text, keywords) => {
  const haystack = normalize(text);
  if (!haystack) return false;
  return keywords.some((keyword) => haystack.includes(normalize(keyword)));
};

const isAuthField = (field) =>
  hasAnyKeyword(`${field?.label || ""} ${field?.name || ""} ${field?.id || ""}`, AUTH_KEYWORDS);

const isCaptchaField = (field) =>
  hasAnyKeyword(`${field?.label || ""} ${field?.name || ""} ${field?.id || ""}`, CAPTCHA_KEYWORDS);

const resolveRequiredDocFromField = (field, requiredDocuments = []) => {
  const descriptor = normalize(`${field?.label || ""} ${field?.name || ""} ${field?.id || ""}`);
  if (!descriptor) return "";
  let best = "";
  let bestScore = 0;

  for (const required of toList(requiredDocuments)) {
    const req = normalize(required);
    if (!req) continue;
    let score = 0;
    if (descriptor.includes(req) || req.includes(descriptor)) score += 8;
    const reqTokens = req.split(" ").filter(Boolean);
    score += reqTokens.filter((token) => descriptor.includes(token)).length;
    if (score > bestScore) {
      bestScore = score;
      best = String(required || "").trim();
    }
  }

  if (bestScore > 0) return best;
  return String(field?.label || field?.name || field?.id || "Document").trim();
};

const buildUploadSteps = ({ fields = [], requiredDocuments = [], uploadedDocuments = [] }) => {
  const fileFields = toList(fields).filter((field) => field.type === "file");
  if (fileFields.length === 0) {
    return {
      upload_steps: [],
      upload_mapping: [],
      missing_documents: [],
    };
  }

  const requiredByField = fileFields.map((field) =>
    resolveRequiredDocFromField(field, requiredDocuments)
  );
  const resolved = resolveRequiredDocumentMatches(requiredByField, uploadedDocuments);

  const uploadSteps = [];
  const uploadMapping = [];
  const missingDocuments = [];

  resolved.matches.forEach((item, index) => {
    const field = fileFields[index];
    const targetField = String(field?.name || field?.id || field?.label || `file_${index + 1}`).trim();
    if (!item.found) {
      missingDocuments.push(item.required_document_name);
      uploadMapping.push({
        field: targetField,
        required_document_name: item.required_document_name,
        found: false,
        file_url: "",
      });
      return;
    }

    uploadSteps.push({
      action: "upload_file",
      field: targetField,
      selector: String(field?.selector || "").trim(),
      file_url: item.matched_document_url,
      document_name: item.matched_document_name || item.required_document_name || "",
    });
    uploadMapping.push({
      field: targetField,
      required_document_name: item.required_document_name,
      found: true,
      file_url: item.matched_document_url,
    });
  });

  return {
    upload_steps: uploadSteps,
    upload_mapping: uploadMapping,
    missing_documents: missingDocuments,
  };
};

export const generateAutomationStepsFromFormStructure = ({
  officialApplicationLink = "",
  userProfile = {},
  uploadedDocuments = [],
  requiredDocuments = [],
  formStructure = {},
  aiSuggestions = [],
}) => {
  const normalizedFields = coerceFormFields(formStructure?.fields || []);
  const loginAuthDetected = normalizedFields.some((field) => isAuthField(field));
  const captchaDetected = normalizedFields.some((field) => isCaptchaField(field));

  const syntheticForm = {
    form_kind: "application",
    fields: normalizedFields,
  };

  const mappingResult = buildFieldMappings({
    forms: [syntheticForm],
    userProfile,
    portalCredentials: {},
    aiSuggestions,
  });

  const fieldSteps = mappingResult.mappings
    .filter((mapping) => mapping.source_key !== "password" && mapping.source_key !== "confirm_password")
    .map((mapping) => ({
      action: mapping.action_type,
      field: mapping.field_name,
      selector: String(mapping.selector || "").trim(),
      value: String(mapping.value ?? ""),
    }));

  const uploadResult = buildUploadSteps({
    fields: normalizedFields,
    requiredDocuments,
    uploadedDocuments,
  });

  const automationSteps = [];
  if (officialApplicationLink) {
    automationSteps.push({
      action: "navigate",
      url: officialApplicationLink,
    });
  }

  if (loginAuthDetected) {
    automationSteps.push({
      action: "manual_authentication_required",
      field: "login",
      value: "User should complete login/authentication manually.",
    });
  }

  automationSteps.push(...fieldSteps);
  automationSteps.push(...uploadResult.upload_steps);

  if (captchaDetected) {
    automationSteps.push({
      action: "manual_captcha_required",
      field: "captcha",
      value: "Captcha must be solved by the user manually.",
    });
  }

  automationSteps.push({
    action: "review_before_submit",
    field: "form_review",
    value: "User reviews all fields before manually submitting.",
  });

  const assistantHints = [];
  assistantHints.push(`Mapped ${mappingResult.mappings.length} field(s) for autofill.`);
  if (mappingResult.missing_profile_fields.length > 0) {
    assistantHints.push(
      `Missing profile values: ${mappingResult.missing_profile_fields.join(", ")}`
    );
  }
  if (uploadResult.missing_documents.length > 0) {
    assistantHints.push(
      `Missing required documents: ${uploadResult.missing_documents.join(", ")}`
    );
  }
  if (loginAuthDetected) {
    assistantHints.push("Manual login/authentication is required.");
  }
  if (captchaDetected) {
    assistantHints.push("Captcha must be solved manually.");
  }

  return {
    automation_steps: automationSteps,
    field_mappings: mappingResult.mappings.map((item) => ({
      field: item.field_name,
      source_key: item.source_key,
      value: String(item.value ?? ""),
      confidence: Number(item.confidence || 0),
    })),
    missing_profile_fields: mappingResult.missing_profile_fields,
    document_upload_mapping: uploadResult.upload_mapping,
    missing_required_documents: uploadResult.missing_documents,
    safety_notes: [
      "Captcha bypass is not allowed.",
      "Authentication bypass is not allowed.",
      "User review is required before submission.",
    ],
    constraints: {
      authentication_manual: loginAuthDetected,
      captcha_manual: captchaDetected,
      user_review_required: true,
    },
    assistant_hints: assistantHints,
  };
};
