import Profile from "../Schema/Profileschema.js";
import Scheme from "../Schema/Schemeschema.js";
import UserDocument from "../Schema/UserDocumentschema.js";
import { getPortalSafetyReport } from "./automation/safetyPolicy.js";
import { crawlFormRepresentation } from "./automation/formCrawler.js";
import { getCachedFormCrawl, upsertFormCrawlCache } from "./automation/cacheService.js";
import { inferFieldMappingsWithGemini } from "./automation/geminiFieldAgent.js";
import { buildFieldMappings } from "./automation/fieldMapper.js";
import { resolveRequiredDocumentMatches } from "./automation/documentMapper.js";
import { buildAutomationPlan } from "./automation/planBuilder.js";
import { createAutomationSession, getAutomationSessionById, markSessionStatus } from "./automation/sessionService.js";
import { writeAutomationLog } from "./automation/logService.js";
import { executeAutomationActions } from "./automation/browserExecutor.js";
import { generateAutomationStepsFromFormStructure } from "./automation/autofillStepGenerator.js";
import { generateFallbackPdfGuide } from "./automation/fallbackGuideService.js";

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const AUTO_GENERATE_FALLBACK_GUIDE = /^(1|true|yes)$/i.test(
  String(process.env.AUTOMATION_AUTO_FALLBACK_GUIDE || "true")
);

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

const parseBool = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  return /^(1|true|yes)$/i.test(String(value));
};

const shouldGenerateFallbackGuide = (req) =>
  parseBool(req?.body?.generate_fallback_guide, AUTO_GENERATE_FALLBACK_GUIDE);

const safeGenerateFallbackGuide = async ({
  enabled,
  portalUrl = "",
  actions = [],
  formRepresentation = null,
  reason = "",
}) => {
  if (!enabled) return null;
  try {
    return await generateFallbackPdfGuide({
      portalUrl,
      actions,
      formRepresentation,
      reason,
    });
  } catch {
    return null;
  }
};

const pickSchemeLink = (schemeData = {}) =>
  String(
    schemeData?.official_application_link ||
      schemeData?.apply_link ||
      schemeData?.original_apply_link ||
      schemeData?.scheme_page_link ||
      ""
  ).trim();

const unifyProfile = (profileFromDb = {}, profileInput = {}, documents = []) => {
  const normalizeKey = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const profile = {
    name: profileInput?.name || "",
    date_of_birth: profileInput?.date_of_birth || profileInput?.dob || "",
    age: profileInput?.age ?? profileFromDb?.age ?? "",
    gender: profileInput?.gender || profileFromDb?.gender || "",
    occupation: profileInput?.occupation || profileFromDb?.occupation || "",
    income:
      profileInput?.income ??
      profileInput?.annual_income ??
      profileFromDb?.annual_income ??
      "",
    state: profileInput?.state || profileInput?.location?.state || profileFromDb?.location?.state || "",
    category: profileInput?.category || profileFromDb?.category || "",
    aadhaar_number: profileInput?.aadhaar_number || "",
    pan_number: profileInput?.pan_number || "",
    bank_account: profileInput?.bank_account || "",
    ifsc_code: profileInput?.ifsc_code || "",
    email: profileInput?.email || "",
    phone: profileInput?.phone || profileFromDb?.phone || "",
    address: profileInput?.address || "",
  };

  const mergeIfMissing = (targetKey, value) => {
    if (profile[targetKey]) return;
    if (value === null || value === undefined || value === "") return;
    profile[targetKey] = value;
  };

  for (const doc of documents) {
    const extracted = doc?.extracted_data || {};
    const autofill = doc?.autofill_fields || {};
    mergeIfMissing("name", extracted.name || extracted.candidate_name || autofill.applicant_name);
    mergeIfMissing("date_of_birth", extracted.date_of_birth || autofill.dob);
    mergeIfMissing("aadhaar_number", extracted.aadhaar_number || autofill.aadhaar);
    mergeIfMissing("pan_number", extracted.pan_number || autofill.pan);
    mergeIfMissing("income", extracted.annual_income || autofill.annual_income);
    mergeIfMissing("bank_account", extracted.account_number || autofill.bank_account);
    mergeIfMissing("ifsc_code", extracted.ifsc_code || autofill.ifsc);
    mergeIfMissing("address", extracted.address || autofill.address);

    Object.entries({ ...(extracted || {}), ...(autofill || {}) }).forEach(([key, value]) => {
      if (value === null || value === undefined || typeof value === "object") return;
      const normalizedKey = normalizeKey(key);
      const text = String(value).trim();
      if (!normalizedKey || !text) return;
      mergeIfMissing(normalizedKey, text);
    });
  }

  return profile;
};

const mapUploadedDocs = (documents = []) =>
  (documents || [])
    .map((doc) => ({
      document_name: String(doc?.document_name || "").trim(),
      cloudinary_url: String(doc?.cloudinary_url || "").trim(),
    }))
    .filter((doc) => doc.document_name && doc.cloudinary_url);

const maskSensitiveActions = (actions = []) =>
  (actions || []).map((action) => {
    if (action?.sensitive || normalize(action?.field).includes("password")) {
      return {
        ...action,
        value: "[REDACTED]",
        requires_runtime_credentials: true,
      };
    }
    return action;
  });

const hydrateSensitiveActions = (actions = [], portalCredentials = {}) =>
  (actions || []).map((action) => {
    if (!action?.requires_runtime_credentials) return action;
    if (normalize(action?.field).includes("password")) {
      return {
        ...action,
        value: String(portalCredentials?.password || ""),
      };
    }
    if (normalize(action?.field).includes("email")) {
      return {
        ...action,
        value: String(portalCredentials?.email || action.value || ""),
      };
    }
    return action;
  });

const getOrCrawlForms = async ({ portalUrl, forceRefresh }) => {
  if (!forceRefresh) {
    const cached = await getCachedFormCrawl(portalUrl);
    if (cached?.crawled_data?.forms?.length) {
      return {
        crawlData: cached.crawled_data,
        cacheHit: true,
      };
    }
  }

  const crawled = await crawlFormRepresentation(portalUrl);
  await upsertFormCrawlCache({
    url: portalUrl,
    crawlHash: crawled.crawl_hash,
    crawledData: crawled,
  });
  return {
    crawlData: crawled,
    cacheHit: false,
  };
};

const summarizeForms = (crawlData = {}) => ({
  page_title: crawlData?.page_title || "",
  page_url: crawlData?.page_url || "",
  total_forms: (crawlData?.forms || []).length,
  login_forms: crawlData?.detected?.login_forms || 0,
  signup_forms: crawlData?.detected?.signup_forms || 0,
  application_forms: crawlData?.detected?.application_forms || 0,
  file_upload_fields: crawlData?.detected?.file_upload_fields || 0,
  has_captcha: Boolean(crawlData?.detected?.has_captcha),
});

export const crawlApplicationPortal = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized user",
    });
  }

  let portalUrl = "";
  const includeFallbackGuide = shouldGenerateFallbackGuide(req);
  try {
    const schemeData = req.body?.scheme_data || req.body?.schemeData || req.body || {};
    const schemeName = String(schemeData?.scheme_name || "").trim();
    portalUrl = pickSchemeLink(schemeData) || String(req.body?.official_application_link || "").trim();
    if (!portalUrl && schemeName) {
      const schemeFromDb = await Scheme.findOne({ scheme_name: schemeName }).lean();
      portalUrl = pickSchemeLink(schemeFromDb || {});
    }
    const forceRefresh = parseBool(req.body?.force_refresh, false);

    const safety = getPortalSafetyReport(portalUrl);
    if (!safety.allowed) {
      await writeAutomationLog({
        userId,
        schemeName: schemeData?.scheme_name,
        step: "crawl_portal",
        status: "warning",
        message: safety.reason,
        metadata: { portal_url: portalUrl },
      });
      const fallbackGuide = await safeGenerateFallbackGuide({
        enabled: includeFallbackGuide,
        portalUrl,
        actions: [],
        formRepresentation: null,
        reason: safety.reason,
      });
      return res.status(400).json({
        success: false,
        message: safety.reason,
        fallback_guide: fallbackGuide,
      });
    }

    const { crawlData, cacheHit } = await getOrCrawlForms({
      portalUrl: safety.normalized_url,
      forceRefresh,
    });

    const blockedByManualChecks =
      Boolean(crawlData?.detected?.has_captcha) ||
      Number(crawlData?.detected?.login_forms || 0) > 0;
    const fallbackGuide = blockedByManualChecks
      ? await safeGenerateFallbackGuide({
          enabled: includeFallbackGuide,
          portalUrl: safety.normalized_url,
          actions: [],
          formRepresentation: crawlData,
          reason: "Portal requires manual login/captcha handling before automation can continue",
        })
      : null;

    await writeAutomationLog({
      userId,
      schemeName: schemeData?.scheme_name,
      step: "crawl_portal",
      status: "success",
      message: "Portal form crawl completed",
      metadata: {
        portal_url: safety.normalized_url,
        cache_hit: cacheHit,
        forms: (crawlData?.forms || []).length,
      },
    });

    return res.status(200).json({
      success: true,
      cache_hit: cacheHit,
      safety,
      form_representation: crawlData,
      summary: summarizeForms(crawlData),
      fallback_guide: fallbackGuide,
    });
  } catch (error) {
    const fallbackGuide = await safeGenerateFallbackGuide({
      enabled: includeFallbackGuide,
      portalUrl,
      actions: [],
      formRepresentation: null,
      reason: `Crawl failed: ${error.message}`,
    });
    return res.status(500).json({
      success: false,
      message: "Failed to crawl application portal",
      error: error.message,
      fallback_guide: fallbackGuide,
    });
  }
};

export const generateFormAutofillPlan = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized user",
    });
  }

  const includeFallbackGuide = shouldGenerateFallbackGuide(req);
  let officialApplicationLink = "";
  try {
    const schemeData = req.body?.scheme_data || req.body?.schemeData || {};
    const userDataInput = req.body?.user_data || req.body?.userData || {};
    const profileDataInput = req.body?.profile_data || req.body?.profileData || {};
    const userProfileInput = req.body?.user_profile || req.body?.userProfile || {};
    const autofillDataInput = req.body?.autofill_data || req.body?.autofillData || {};
    const mergedInputProfile = {
      ...(profileDataInput && typeof profileDataInput === "object" ? profileDataInput : {}),
      ...(userProfileInput && typeof userProfileInput === "object" ? userProfileInput : {}),
      ...(autofillDataInput && typeof autofillDataInput === "object" ? autofillDataInput : {}),
      ...(userDataInput && typeof userDataInput === "object" ? userDataInput : {}),
    };
    const userDocumentsInput =
      req.body?.user_documents?.documents ||
      req.body?.userDocuments?.documents ||
      req.body?.documents ||
      [];
    const formStructure = req.body?.form_structure || req.body?.formStructure || {};
    const schemeName = String(schemeData?.scheme_name || "").trim();

    const fields = Array.isArray(formStructure?.fields) ? formStructure.fields : [];
    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "form_structure.fields is required",
      });
    }

    officialApplicationLink =
      pickSchemeLink(schemeData) || String(req.body?.official_application_link || "").trim();
    if (!officialApplicationLink && schemeName) {
      const schemeFromDb = await Scheme.findOne({ scheme_name: schemeName }).lean();
      officialApplicationLink = pickSchemeLink(schemeFromDb || {});
    }

    if (officialApplicationLink) {
      const safety = getPortalSafetyReport(officialApplicationLink);
      if (!safety.allowed) {
        await writeAutomationLog({
          userId,
          schemeName,
          step: "generate_autofill_plan",
          status: "warning",
          message: safety.reason,
          metadata: {
            official_application_link: officialApplicationLink,
          },
        });
        const fallbackGuide = await safeGenerateFallbackGuide({
          enabled: includeFallbackGuide,
          portalUrl: officialApplicationLink,
          actions: [],
          formRepresentation: {
            forms: [
              {
                fields,
              },
            ],
          },
          reason: safety.reason,
        });
        return res.status(400).json({
          success: false,
          message: safety.reason,
          fallback_guide: fallbackGuide,
        });
      }
      officialApplicationLink = safety.normalized_url;
    }

    const profileFromDb = await Profile.findOne({ user: userId }).lean();
    const dbUserDocuments = await UserDocument.find({ user_id: userId })
      .sort({ uploaded_at: -1 })
      .lean();
    const fallbackDocuments = dbUserDocuments.map((doc) => ({
      document_name: doc.document_name,
      cloudinary_url: doc.cloudinary_url,
    }));
    const providedDocuments = mapUploadedDocs(userDocumentsInput);
    const mergedDocuments = providedDocuments.length > 0 ? providedDocuments : fallbackDocuments;

    const mergedProfile = unifyProfile(profileFromDb || {}, mergedInputProfile, dbUserDocuments);
    const requiredDocuments = toStringList(schemeData?.documents_required);
    const syntheticForms = [
      {
        form_kind: "application",
        fields,
      },
    ];
    const aiSuggestions = await inferFieldMappingsWithGemini({
      forms: syntheticForms,
    });

    const plan = generateAutomationStepsFromFormStructure({
      officialApplicationLink,
      userProfile: mergedProfile,
      uploadedDocuments: mergedDocuments,
      requiredDocuments,
      formStructure,
      aiSuggestions,
    });

    const needsManualGuide =
      Boolean(plan?.constraints?.authentication_manual) ||
      Boolean(plan?.constraints?.captcha_manual) ||
      (Array.isArray(plan?.missing_required_documents) && plan.missing_required_documents.length > 0);
    const fallbackGuide = needsManualGuide
      ? await safeGenerateFallbackGuide({
          enabled: includeFallbackGuide,
          portalUrl: officialApplicationLink,
          actions: plan.automation_steps || [],
          formRepresentation: {
            forms: [
              {
                fields,
              },
            ],
          },
          reason: "Manual/blocked scenario detected. Generated guide with sample fill instructions.",
        })
      : null;

    await writeAutomationLog({
      userId,
      schemeName,
      step: "generate_autofill_plan",
      status: "success",
      message: "Generated structured automation steps from provided form fields",
      metadata: {
        fields_count: fields.length,
        mapped_fields: plan.field_mappings.length,
        ai_suggestions: aiSuggestions.length,
        missing_required_documents: plan.missing_required_documents,
      },
    });

    return res.status(200).json({
      ...plan,
      fallback_guide: fallbackGuide,
    });
  } catch (error) {
    const fallbackGuide = await safeGenerateFallbackGuide({
      enabled: includeFallbackGuide,
      portalUrl: officialApplicationLink,
      actions: [],
      formRepresentation: null,
      reason: `Autofill plan generation failed: ${error.message}`,
    });
    return res.status(500).json({
      success: false,
      message: "Failed to generate autofill plan",
      error: error.message,
      fallback_guide: fallbackGuide,
    });
  }
};

export const generateManualFallbackGuide = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized user",
    });
  }

  try {
    const sessionId = String(req.body?.session_id || "").trim();
    const schemeData = req.body?.scheme_data || req.body?.schemeData || {};
    const reason = String(req.body?.reason || "Manual fallback guide requested").trim();
    const providedActions = Array.isArray(req.body?.actions)
      ? req.body.actions
      : Array.isArray(req.body?.automation_steps)
        ? req.body.automation_steps
        : [];
    const formRepresentation = req.body?.form_representation || null;

    let portalUrl =
      pickSchemeLink(schemeData) || String(req.body?.official_application_link || "").trim();
    let actions = providedActions;

    if (sessionId) {
      const session = await getAutomationSessionById(sessionId, userId);
      if (session) {
        portalUrl = session.official_application_link || portalUrl;
        if (actions.length === 0) actions = session.preview_plan?.actions || [];
      }
    }

    if (portalUrl) {
      const safety = getPortalSafetyReport(portalUrl);
      if (!safety.allowed) {
        return res.status(400).json({
          success: false,
          message: safety.reason,
        });
      }
      portalUrl = safety.normalized_url;
    }

    const fallbackGuide = await safeGenerateFallbackGuide({
      enabled: true,
      portalUrl,
      actions,
      formRepresentation,
      reason,
    });

    return res.status(200).json({
      success: Boolean(fallbackGuide?.generated),
      fallback_guide: fallbackGuide,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate manual fallback guide",
      error: error.message,
    });
  }
};

export const previewAutomationPlan = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized user",
    });
  }

  const includeFallbackGuide = shouldGenerateFallbackGuide(req);
  let portalUrl = "";
  try {
    const schemeData = req.body?.scheme_data || req.body?.schemeData || req.body || {};
    const profileInput = req.body?.user_profile || req.body?.userProfile || {};
    const providedDocuments = mapUploadedDocs(req.body?.documents || req.body?.user_documents || []);
    const portalCredentials = req.body?.portal_credentials || {};
    const forceRefresh = parseBool(req.body?.force_refresh, false);
    const allowSignupFlow = parseBool(req.body?.allow_signup_flow, true);

    const schemeName = String(schemeData?.scheme_name || "").trim();
    portalUrl = pickSchemeLink(schemeData);

    if (!portalUrl && schemeName) {
      const schemeFromDb = await Scheme.findOne({ scheme_name: schemeName }).lean();
      portalUrl = pickSchemeLink(schemeFromDb || {});
    }

    const safety = getPortalSafetyReport(portalUrl);
    if (!safety.allowed) {
      await writeAutomationLog({
        userId,
        schemeName,
        step: "preview_plan",
        status: "warning",
        message: safety.reason,
        metadata: { portal_url: portalUrl },
      });
      const fallbackGuide = await safeGenerateFallbackGuide({
        enabled: includeFallbackGuide,
        portalUrl,
        actions: [],
        formRepresentation: null,
        reason: safety.reason,
      });
      return res.status(400).json({
        success: false,
        message: safety.reason,
        fallback_guide: fallbackGuide,
      });
    }

    const profileFromDb = await Profile.findOne({ user: userId }).lean();
    const dbUserDocuments = await UserDocument.find({ user_id: userId })
      .sort({ uploaded_at: -1 })
      .lean();
    const fallbackDocuments = dbUserDocuments.map((doc) => ({
      document_name: doc.document_name,
      cloudinary_url: doc.cloudinary_url,
    }));

    const mergedDocuments = providedDocuments.length > 0 ? providedDocuments : fallbackDocuments;
    const normalizedProfile = unifyProfile(profileFromDb || {}, profileInput, dbUserDocuments);
    const requiredDocuments = toStringList(schemeData?.documents_required);
    const documentResolution = resolveRequiredDocumentMatches(requiredDocuments, mergedDocuments);

    const { crawlData, cacheHit } = await getOrCrawlForms({
      portalUrl: safety.normalized_url,
      forceRefresh,
    });

    const aiSuggestions = await inferFieldMappingsWithGemini({
      forms: crawlData?.forms || [],
    });

    const fieldMappings = buildFieldMappings({
      forms: crawlData?.forms || [],
      userProfile: normalizedProfile,
      portalCredentials,
      aiSuggestions,
    });

    const plan = buildAutomationPlan({
      pageUrl: safety.normalized_url,
      crawlData,
      mappedFields: fieldMappings.mappings,
      documentMatches: documentResolution.matches,
      portalCredentials,
      allowSignupFlow,
    });

    const needsManualGuide =
      plan.warnings.length > 0 ||
      Boolean(crawlData?.detected?.has_captcha) ||
      Number(crawlData?.detected?.login_forms || 0) > 0 ||
      documentResolution.missing_required_documents.length > 0;
    const fallbackGuide = needsManualGuide
      ? await safeGenerateFallbackGuide({
          enabled: includeFallbackGuide,
          portalUrl: safety.normalized_url,
          actions: plan.actions || [],
          formRepresentation: crawlData,
          reason:
            plan.warnings.join("; ") ||
            "Manual intervention may be required. Generated step-by-step PDF guide.",
        })
      : null;

    const maskedActions = maskSensitiveActions(plan.actions);
    const session = await createAutomationSession({
      userId,
      schemeName,
      officialApplicationLink: safety.normalized_url,
      previewPlan: {
        actions: maskedActions,
        summary: plan.summary,
        missing_profile_fields: fieldMappings.missing_profile_fields,
        missing_required_documents: documentResolution.missing_required_documents,
      },
      crawlSnapshot: summarizeForms(crawlData),
      warnings: plan.warnings,
    });

    await writeAutomationLog({
      userId,
      sessionId: session._id,
      schemeName,
      step: "preview_plan",
      status: "success",
      message: "Automation preview generated",
      metadata: {
        cache_hit: cacheHit,
        action_count: maskedActions.length,
        missing_required_documents: documentResolution.missing_required_documents,
      },
    });

    return res.status(200).json({
      success: true,
      preview_required: true,
      session_id: String(session._id),
      confirm_token: session.confirm_token,
      safety,
      actions: maskedActions,
      summary: plan.summary,
      warnings: plan.warnings,
      missing_profile_fields: fieldMappings.missing_profile_fields,
      missing_required_documents: documentResolution.missing_required_documents,
      required_document_matches: documentResolution.matches,
      form_summary: summarizeForms(crawlData),
      form_representation: crawlData,
      cache_hit: cacheHit,
      fallback_guide: fallbackGuide,
    });
  } catch (error) {
    const fallbackGuide = await safeGenerateFallbackGuide({
      enabled: includeFallbackGuide,
      portalUrl,
      actions: [],
      formRepresentation: null,
      reason: `Preview generation failed: ${error.message}`,
    });
    return res.status(500).json({
      success: false,
      message: "Failed to generate automation preview",
      error: error.message,
      fallback_guide: fallbackGuide,
    });
  }
};

export const executeAutomationPlan = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized user",
    });
  }

  const includeFallbackGuide = shouldGenerateFallbackGuide(req);
  try {
    const sessionId = String(req.body?.session_id || "").trim();
    const confirmToken = String(req.body?.confirm_token || "").trim();
    const confirmSubmission = parseBool(req.body?.confirm_submission, false);
    const dryRunFillOnly = parseBool(req.body?.dry_run_fill_only, false);
    const portalCredentials = req.body?.portal_credentials || {};
    const forceSimulation = parseBool(req.body?.force_simulation, true);

    if (!sessionId || !confirmToken) {
      return res.status(400).json({
        success: false,
        message: "session_id and confirm_token are required",
      });
    }
    if (!confirmSubmission && !dryRunFillOnly) {
      return res.status(400).json({
        success: false,
        message: "User confirmation is required before submission (or use dry_run_fill_only=true)",
      });
    }

    const session = await getAutomationSessionById(sessionId, userId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Automation session not found",
      });
    }
    if (session.confirm_token !== confirmToken) {
      return res.status(403).json({
        success: false,
        message: "Invalid confirmation token",
      });
    }

    const safety = getPortalSafetyReport(session.official_application_link);
    if (!safety.allowed) {
      await markSessionStatus(sessionId, "failed", {
        reason: safety.reason,
      });
      const fallbackGuide = await safeGenerateFallbackGuide({
        enabled: includeFallbackGuide,
        portalUrl: session.official_application_link || "",
        actions: session.preview_plan?.actions || [],
        formRepresentation: null,
        reason: safety.reason,
      });
      return res.status(400).json({
        success: false,
        message: safety.reason,
        fallback_guide: fallbackGuide,
      });
    }

    await markSessionStatus(sessionId, "confirmed", {
      confirmed_at: new Date().toISOString(),
    });

    const hydratedActions = hydrateSensitiveActions(session.preview_plan?.actions || [], portalCredentials);
    const missingCredentialAction = hydratedActions.find(
      (action) => action.requires_runtime_credentials && !String(action.value || "").trim()
    );
    if (missingCredentialAction && !dryRunFillOnly) {
      await markSessionStatus(sessionId, "failed", {
        reason: "Missing runtime credentials",
      });
      const fallbackGuide = await safeGenerateFallbackGuide({
        enabled: includeFallbackGuide,
        portalUrl: session.official_application_link || "",
        actions: hydratedActions,
        formRepresentation: null,
        reason: "Missing credentials. Please login manually and follow fill guide.",
      });
      return res.status(400).json({
        success: false,
        message: `Missing runtime credential for field ${missingCredentialAction.field || "unknown"}`,
        fallback_guide: fallbackGuide,
      });
    }

    const actions = hydratedActions.map((action) => {
      if (!dryRunFillOnly) return action;
      if (!action.requires_runtime_credentials) return action;
      if (String(action.value || "").trim()) return action;
      return {
        ...action,
        skip_execution: true,
        skip_reason: "Skipped in dry_run_fill_only: missing runtime credential",
      };
    });

    const execution = await executeAutomationActions({
      actions,
      confirmSubmission,
      dryRunFillOnly,
      forceSimulation,
    });

    const finalStatus = execution?.executed ? "executed" : "failed";
    const updatedSession = await markSessionStatus(sessionId, finalStatus, {
      executed_at: new Date().toISOString(),
      simulation: Boolean(execution?.simulation),
      dry_run_fill_only: Boolean(dryRunFillOnly),
      logs: execution?.logs || [],
    });

    await writeAutomationLog({
      userId,
      sessionId,
      schemeName: session.scheme_name,
      step: "execute_plan",
      status: finalStatus === "executed" ? "success" : "error",
      message: finalStatus === "executed" ? "Automation execution completed" : "Automation execution failed",
      metadata: {
        simulation: Boolean(execution?.simulation),
        dry_run_fill_only: Boolean(dryRunFillOnly),
        steps: (execution?.logs || []).length,
      },
    });

    const fallbackGuide =
      finalStatus === "failed"
        ? await safeGenerateFallbackGuide({
            enabled: includeFallbackGuide,
            portalUrl: session.official_application_link || "",
            actions,
            formRepresentation: null,
            reason: "Execution failed. Follow this guide to complete the form manually.",
          })
        : null;

    return res.status(200).json({
      success: finalStatus === "executed",
      session_id: sessionId,
      status: finalStatus,
      simulation: Boolean(execution?.simulation),
      dry_run_fill_only: Boolean(dryRunFillOnly),
      submit_skipped: Boolean(dryRunFillOnly),
      execution_logs: execution?.logs || [],
      runtime_summary: updatedSession?.runtime_summary || {},
      fallback_guide: fallbackGuide,
    });
  } catch (error) {
    const fallbackGuide = await safeGenerateFallbackGuide({
      enabled: includeFallbackGuide,
      portalUrl: "",
      actions: [],
      formRepresentation: null,
      reason: `Execution failed: ${error.message}`,
    });
    return res.status(500).json({
      success: false,
      message: "Failed to execute automation plan",
      error: error.message,
      fallback_guide: fallbackGuide,
    });
  }
};

export const getAutomationSession = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized user",
    });
  }

  try {
    const sessionId = String(req.params?.id || "").trim();
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    const session = await getAutomationSessionById(sessionId, userId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Automation session not found",
      });
    }

    return res.status(200).json({
      success: true,
      session: {
        session_id: String(session._id),
        scheme_name: session.scheme_name || "",
        official_application_link: session.official_application_link || "",
        status: session.status || "planned",
        warnings: session.warnings || [],
        preview_plan: session.preview_plan || {},
        crawl_snapshot: session.crawl_snapshot || {},
        runtime_summary: session.runtime_summary || {},
        created_at: session.createdAt ? new Date(session.createdAt).toISOString() : "",
        updated_at: session.updatedAt ? new Date(session.updatedAt).toISOString() : "",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch automation session",
      error: error.message,
    });
  }
};
