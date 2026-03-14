import crypto from "node:crypto";
import AutomationSession from "../../Schema/AutomationSessionSchema.js";

const createConfirmToken = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
};

export const createAutomationSession = async ({
  userId,
  schemeName,
  officialApplicationLink,
  previewPlan,
  crawlSnapshot,
  warnings = [],
}) => {
  return AutomationSession.create({
    user_id: userId,
    scheme_name: String(schemeName || "").trim(),
    official_application_link: String(officialApplicationLink || "").trim(),
    confirm_token: createConfirmToken(),
    status: "planned",
    preview_plan: previewPlan || {},
    crawl_snapshot: crawlSnapshot || {},
    runtime_summary: {},
    warnings: Array.isArray(warnings) ? warnings : [],
    updated_at: new Date(),
  });
};

export const markSessionStatus = async (sessionId, status, runtimeSummary = {}) => {
  return AutomationSession.findByIdAndUpdate(
    sessionId,
    {
      status,
      runtime_summary: runtimeSummary || {},
      updated_at: new Date(),
    },
    { new: true }
  );
};

export const getAutomationSessionById = async (sessionId, userId) => {
  return AutomationSession.findOne({ _id: sessionId, user_id: userId }).lean();
};
