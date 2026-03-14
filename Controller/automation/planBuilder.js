import { normalizeDocumentName } from "./documentMapper.js";

const AUTOMATION_FILL_OPTIONAL_FIELDS = /^(1|true|yes)$/i.test(
  String(process.env.AUTOMATION_FILL_OPTIONAL_FIELDS || "true")
);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const resolveSelector = (field) => {
  if (field?.id) return `#${field.id}`;
  if (field?.name) return `[name="${field.name}"]`;
  return "";
};

const findFieldByIntent = (fields = [], intents = []) =>
  (fields || []).find((field) => {
    const haystack = normalize(`${field?.label || ""} ${field?.name || ""} ${field?.id || ""}`);
    return intents.some((intent) => haystack.includes(normalize(intent)));
  }) || null;

const pickPrimaryForm = (forms = [], kind) => forms.find((form) => form.form_kind === kind) || null;

const buildLoginActions = ({ loginForm, portalCredentials, warnings }) => {
  const actions = [];
  if (!loginForm) return actions;

  const emailField =
    findFieldByIntent(loginForm.fields, ["email", "username", "user id", "login id"]) ||
    loginForm.fields.find((field) => field.type === "email");
  const passwordField =
    findFieldByIntent(loginForm.fields, ["password"]) || loginForm.fields.find((field) => field.type === "password");

  if (!portalCredentials?.email || !portalCredentials?.password) {
    warnings.push("Login form detected but portal credentials are missing.");
    return actions;
  }

  if (emailField && resolveSelector(emailField)) {
    actions.push({
      type: "fill_input",
      form_kind: "login",
      field: emailField.name || emailField.id || "email",
      selector: resolveSelector(emailField),
      value: portalCredentials.email,
    });
  }
  if (passwordField && resolveSelector(passwordField)) {
    actions.push({
      type: "fill_input",
      form_kind: "login",
      field: passwordField.name || passwordField.id || "password",
      selector: resolveSelector(passwordField),
      value: portalCredentials.password,
      sensitive: true,
    });
  }

  const submit = loginForm.submit_buttons?.[0];
  if (submit) {
    actions.push({
      type: "click",
      form_kind: "login",
      field: submit.name || submit.id || "login_submit",
      selector: submit.id ? `#${submit.id}` : "",
      value: submit.label || "Login",
    });
  }

  actions.push({
    type: "wait",
    duration_ms: 2000,
  });
  return actions;
};

const buildSignupActions = ({ signupForm, mappedFields, allowSignupFlow, warnings }) => {
  if (!signupForm || !allowSignupFlow) return [];
  const actions = [];
  const signupMappings = mappedFields.filter((item) => item.form_kind === "signup");
  for (const mapping of signupMappings) {
    actions.push({
      type: mapping.action_type,
      form_kind: "signup",
      field: mapping.field_name,
      selector: mapping.selector,
      value: mapping.value,
    });
  }

  if (signupMappings.length === 0) {
    warnings.push("Signup form found but no high-confidence signup field mappings were generated.");
    return [];
  }

  const submit = signupForm.submit_buttons?.[0];
  if (submit) {
    actions.push({
      type: "click",
      form_kind: "signup",
      field: submit.name || submit.id || "signup_submit",
      selector: submit.id ? `#${submit.id}` : "",
      value: submit.label || "Sign Up",
    });
    actions.push({
      type: "wait",
      duration_ms: 2000,
    });
  }
  return actions;
};

const resolveUploadForField = (field, documentMatches = []) => {
  const uploadLabel = normalize(`${field?.label || ""} ${field?.name || ""} ${field?.id || ""}`);
  if (!uploadLabel) return null;

  let best = null;
  let bestScore = 0;
  for (const item of documentMatches) {
    if (!item?.found) continue;
    const docName = normalize(item.required_document_name);
    const docKey = normalize(item.required_document_key || normalizeDocumentName(item.required_document_name));
    let score = 0;
    if (docName && uploadLabel.includes(docName)) score += 8;
    if (docKey && uploadLabel.includes(docKey.replace(/_/g, " "))) score += 6;
    if (docName && (docName.includes(uploadLabel) || uploadLabel.includes(docName))) score += 4;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 3 ? best : null;
};

const buildApplicationActions = ({ applicationForm, mappedFields, documentMatches, warnings }) => {
  const actions = [];
  if (!applicationForm) {
    warnings.push("Application form could not be identified on the page.");
    return actions;
  }

  let applicationMappings = mappedFields.filter(
    (item) => item.form_kind === "application" || item.form_kind === "unknown"
  );

  applicationMappings = applicationMappings
    .filter((item) => AUTOMATION_FILL_OPTIONAL_FIELDS || item.required)
    .sort(
      (a, b) =>
        Number(Boolean(b.required)) - Number(Boolean(a.required)) ||
        Number(b.confidence || 0) - Number(a.confidence || 0)
    );

  for (const mapping of applicationMappings) {
    actions.push({
      type: mapping.action_type,
      form_kind: "application",
      field: mapping.field_name,
      selector: mapping.selector,
      value: mapping.value,
      required: Boolean(mapping.required),
      source_key: mapping.source_key,
      confidence: mapping.confidence,
      detection_source: mapping.detection_source,
    });
  }

  for (const uploadField of applicationForm.file_upload_fields || []) {
    const selector = resolveSelector(uploadField);
    if (!selector) continue;
    const matchedDoc = resolveUploadForField(uploadField, documentMatches);
    if (!matchedDoc) {
      warnings.push(
        `Missing mapped document for upload field "${uploadField.label || uploadField.name || uploadField.id}".`
      );
      continue;
    }
    actions.push({
      type: "upload_file",
      form_kind: "application",
      field: uploadField.name || uploadField.id || uploadField.label || "upload",
      selector,
      file_url: matchedDoc.matched_document_url,
      document_name: matchedDoc.required_document_name,
    });
  }

  return actions;
};

export const buildAutomationPlan = ({
  pageUrl,
  crawlData,
  mappedFields,
  documentMatches,
  portalCredentials = {},
  allowSignupFlow = true,
}) => {
  const warnings = [];
  const forms = crawlData?.forms || [];
  const actions = [
    {
      type: "navigate",
      url: pageUrl,
    },
  ];

  const loginForm = pickPrimaryForm(forms, "login");
  const signupForm = pickPrimaryForm(forms, "signup");
  const applicationForm = pickPrimaryForm(forms, "application") || forms[0] || null;

  actions.push(...buildLoginActions({ loginForm, portalCredentials, warnings }));
  actions.push(
    ...buildSignupActions({
      signupForm,
      mappedFields,
      allowSignupFlow,
      warnings,
    })
  );
  actions.push(
    ...buildApplicationActions({
      applicationForm,
      mappedFields,
      documentMatches,
      warnings,
    })
  );

  if (crawlData?.detected?.has_captcha || forms.some((form) => form.contains_captcha)) {
    warnings.push("Captcha detected. Manual completion is required before submission.");
    actions.push({
      type: "manual_step_required",
      field: "captcha",
      reason: "Captcha detected on target portal",
    });
  }

  actions.push({
    type: "preview_pause",
    reason: "User confirmation required before final submission.",
  });

  const submitButton = applicationForm?.submit_buttons?.[0];
  actions.push({
    type: "submit_form",
    field: submitButton?.name || submitButton?.id || "submit",
    selector: submitButton?.id ? `#${submitButton.id}` : "",
    value: submitButton?.label || "Submit Application",
    requires_user_confirmation: true,
  });

  const summary = {
    forms_detected: forms.length,
    login_required: Boolean(loginForm),
    signup_available: Boolean(signupForm),
    application_form_detected: Boolean(applicationForm),
    mapped_fields: mappedFields.length,
    missing_documents: (documentMatches || []).filter((item) => !item.found).map((item) => item.required_document_name),
  };

  return {
    actions,
    warnings,
    summary,
  };
};
