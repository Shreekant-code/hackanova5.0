import AutomationLog from "../../Schema/AutomationLogSchema.js";

const SENSITIVE_KEYS = new Set(["password", "confirm_password", "token", "confirm_token"]);

const sanitizeMetadata = (value) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeMetadata(item));
  if (typeof value !== "object") return value;

  const output = {};
  Object.entries(value).forEach(([key, rawValue]) => {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = sanitizeMetadata(rawValue);
    }
  });
  return output;
};

export const writeAutomationLog = async ({
  userId,
  sessionId = null,
  schemeName = "",
  step = "",
  status = "info",
  message = "",
  metadata = {},
}) => {
  try {
    await AutomationLog.create({
      user_id: userId,
      session_id: sessionId || null,
      scheme_name: String(schemeName || "").trim(),
      step: String(step || "").trim() || "unknown",
      status,
      message: String(message || "").trim(),
      metadata: sanitizeMetadata(metadata),
    });
  } catch {
    // Logging failures should never block automation flow.
  }
};
