import crypto from "node:crypto";

const CRAWL_TIMEOUT_MS = Number(process.env.AUTOMATION_CRAWL_TIMEOUT_MS || 15000);
const USE_PLAYWRIGHT_FALLBACK = /^(1|true|yes)$/i.test(
  String(process.env.AUTOMATION_USE_PLAYWRIGHT_CRAWLER || "false")
);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const decodeHtml = (text) =>
  String(text ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const stripTags = (text) => decodeHtml(String(text ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const extractAttributes = (tagHtml) => {
  const attrs = {};
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match = attrRegex.exec(tagHtml);
  while (match) {
    const key = normalize(match[1]);
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    attrs[key] = String(value).trim();
    match = attrRegex.exec(tagHtml);
  }
  return attrs;
};

const extractLabelLookup = (html) => {
  const byFor = new Map();
  const labelTags = String(html || "").match(/<label\b[\s\S]*?<\/label>/gi) || [];
  for (const tag of labelTags) {
    const openTag = tag.match(/<label\b[^>]*>/i)?.[0] || "";
    const attrs = extractAttributes(openTag);
    const labelText = stripTags(tag);
    if (!labelText) continue;

    const key = normalize(attrs.for || "");
    if (key) byFor.set(key, labelText);
  }
  return byFor;
};

const extractPlaceholderFromAttrs = (attrs = {}) =>
  String(
    attrs.placeholder ||
      attrs["aria-placeholder"] ||
      attrs["data-placeholder"] ||
      attrs["data-placeholder-text"] ||
      attrs.title ||
      ""
  ).trim();

const parseInputTag = (tag, labelLookup) => {
  const attrs = extractAttributes(tag);
  const type = normalize(attrs.type || "text") || "text";
  const name = attrs.name || "";
  const id = attrs.id || "";
  const key = normalize(id || name);
  const placeholder = extractPlaceholderFromAttrs(attrs);
  const label = labelLookup.get(key) || attrs["aria-label"] || placeholder || name || id || "";

  return {
    tag: "input",
    type,
    name,
    id,
    value: attrs.value || "",
    label: String(label).trim(),
    placeholder,
    "aria-label": attrs["aria-label"] || "",
    class_name: attrs.class || "",
    required: /\srequired(?:\s|>|$)/i.test(tag) || attrs.required === "required",
    autocomplete: attrs.autocomplete || "",
    accept: attrs.accept || "",
    multiple: /\smultiple(?:\s|>|$)/i.test(tag) || attrs.multiple === "multiple",
  };
};

const parseTextareaTag = (tag, labelLookup) => {
  const openTag = tag.match(/<textarea\b[^>]*>/i)?.[0] || "";
  const attrs = extractAttributes(openTag);
  const name = attrs.name || "";
  const id = attrs.id || "";
  const key = normalize(id || name);
  const placeholder = extractPlaceholderFromAttrs(attrs);
  const label = labelLookup.get(key) || attrs["aria-label"] || placeholder || name || id || "";

  return {
    tag: "textarea",
    type: "textarea",
    name,
    id,
    value: "",
    label: String(label).trim(),
    placeholder,
    "aria-label": attrs["aria-label"] || "",
    class_name: attrs.class || "",
    required: /\srequired(?:\s|>|$)/i.test(openTag) || attrs.required === "required",
    autocomplete: attrs.autocomplete || "",
    accept: "",
    multiple: false,
  };
};

const parseSelectTag = (tag, labelLookup) => {
  const openTag = tag.match(/<select\b[^>]*>/i)?.[0] || "";
  const attrs = extractAttributes(openTag);
  const name = attrs.name || "";
  const id = attrs.id || "";
  const key = normalize(id || name);
  let placeholder = extractPlaceholderFromAttrs(attrs);
  const label = labelLookup.get(key) || attrs["aria-label"] || placeholder || name || id || "";

  const optionTags = String(tag).match(/<option\b[\s\S]*?<\/option>/gi) || [];
  const options = optionTags
    .map((optionTag) => {
      const open = optionTag.match(/<option\b[^>]*>/i)?.[0] || "";
      const optionAttrs = extractAttributes(open);
      const optionText = stripTags(optionTag);
      const optionValue = optionAttrs.value || optionText;
      if (!optionValue && !optionText) return null;
      return {
        label: optionText || optionValue,
        value: optionValue || optionText,
      };
    })
    .filter(Boolean);

  if (!placeholder) {
    const prompt = options.find((option) => {
      const optionLabel = normalize(option?.label || "");
      const optionValue = normalize(option?.value || "");
      if (!optionLabel) return false;
      if (!optionValue) return true;
      return (
        optionLabel.startsWith("select ") ||
        optionLabel.startsWith("choose ") ||
        optionLabel.startsWith("please select")
      );
    });
    if (prompt) placeholder = String(prompt.label || "").trim();
  }

  return {
    tag: "select",
    type: "select",
    name,
    id,
    value: "",
    label: String(label).trim(),
    placeholder,
    "aria-label": attrs["aria-label"] || "",
    class_name: attrs.class || "",
    required: /\srequired(?:\s|>|$)/i.test(openTag) || attrs.required === "required",
    autocomplete: "",
    accept: "",
    multiple: /\smultiple(?:\s|>|$)/i.test(openTag) || attrs.multiple === "multiple",
    options,
  };
};

const uniqueBySignature = (fields = []) => {
  const seen = new Set();
  const out = [];
  for (const field of fields) {
    const signature = normalize(
      `${field.tag || ""}|${field.type || ""}|${field.id || ""}|${field.name || ""}|${field.placeholder || ""}|${field["aria-label"] || ""}|${field.value || ""}`
    );
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    out.push(field);
  }
  return out;
};

const parseLooseFields = (html, labelLookup) => {
  const fields = [];
  const inputTags = String(html).match(/<input\b[^>]*>/gi) || [];
  for (const tag of inputTags) fields.push(parseInputTag(tag, labelLookup));

  const textareaTags = String(html).match(/<textarea\b[\s\S]*?<\/textarea>/gi) || [];
  for (const tag of textareaTags) fields.push(parseTextareaTag(tag, labelLookup));

  const selectTags = String(html).match(/<select\b[\s\S]*?<\/select>/gi) || [];
  for (const tag of selectTags) fields.push(parseSelectTag(tag, labelLookup));

  return uniqueBySignature(fields);
};

const parseSubmitElements = (formHtml) => {
  const buttons = [];
  const buttonTags = String(formHtml).match(/<button\b[\s\S]*?<\/button>/gi) || [];
  for (const tag of buttonTags) {
    const open = tag.match(/<button\b[^>]*>/i)?.[0] || "";
    const attrs = extractAttributes(open);
    const type = normalize(attrs.type || "submit");
    if (type !== "submit" && type !== "button") continue;
    const label = stripTags(tag) || attrs.value || "Submit";
    buttons.push({
      tag: "button",
      type,
      label,
      id: attrs.id || "",
      name: attrs.name || "",
    });
  }

  const submitInputs = String(formHtml).match(/<input\b[^>]*>/gi) || [];
  for (const tag of submitInputs) {
    const attrs = extractAttributes(tag);
    const type = normalize(attrs.type || "text");
    if (type !== "submit" && type !== "button") continue;
    buttons.push({
      tag: "input",
      type,
      label: attrs.value || attrs.name || attrs.id || "Submit",
      id: attrs.id || "",
      name: attrs.name || "",
    });
  }

  return buttons;
};

const detectFormKind = (form, formText) => {
  const text = normalize(formText);
  const fields = form.fields || [];
  const hasPassword = fields.some((field) => field.type === "password");
  const hasEmailOrUsername = fields.some((field) => {
    const merged = normalize(`${field.label} ${field.name} ${field.id}`);
    return field.type === "email" || merged.includes("email") || merged.includes("username") || merged.includes("user id");
  });
  const hasConfirmPassword = fields.some((field) =>
    normalize(`${field.label} ${field.name} ${field.id}`).includes("confirm password")
  );
  const isSignupHint = /(register|sign up|create account|new account)/i.test(formText);
  const isLoginHint = /(login|log in|sign in)/i.test(formText);

  if (hasPassword && hasEmailOrUsername && (hasConfirmPassword || isSignupHint)) return "signup";
  if (hasPassword && hasEmailOrUsername && isLoginHint) return "login";
  if (hasPassword && hasEmailOrUsername) return "login";
  if (isSignupHint) return "signup";
  if (isLoginHint) return "login";
  if (text.includes("application") || text.includes("apply")) return "application";
  return "unknown";
};

const parseForm = (formHtml, labelLookup, baseUrl) => {
  const openTag = formHtml.match(/<form\b[^>]*>/i)?.[0] || "";
  const attrs = extractAttributes(openTag);
  const action = attrs.action || "";
  let actionUrl = action;
  if (action && baseUrl) {
    try {
      actionUrl = new URL(action, baseUrl).toString();
    } catch {
      actionUrl = action;
    }
  }

  const fieldList = [];
  const inputTags = String(formHtml).match(/<input\b[^>]*>/gi) || [];
  for (const tag of inputTags) fieldList.push(parseInputTag(tag, labelLookup));

  const textareaTags = String(formHtml).match(/<textarea\b[\s\S]*?<\/textarea>/gi) || [];
  for (const tag of textareaTags) fieldList.push(parseTextareaTag(tag, labelLookup));

  const selectTags = String(formHtml).match(/<select\b[\s\S]*?<\/select>/gi) || [];
  for (const tag of selectTags) fieldList.push(parseSelectTag(tag, labelLookup));

  const submitButtons = parseSubmitElements(formHtml);
  const formText = stripTags(formHtml);
  const formKind = detectFormKind({ fields: fieldList }, formText);

  return {
    id: attrs.id || "",
    name: attrs.name || "",
    method: normalize(attrs.method || "get").toUpperCase(),
    action: actionUrl,
    form_kind: formKind,
    fields: fieldList,
    input_fields: fieldList.filter((field) => field.tag === "input" && field.type !== "file"),
    dropdown_fields: fieldList.filter((field) => field.tag === "select"),
    file_upload_fields: fieldList.filter((field) => field.type === "file"),
    submit_buttons: submitButtons,
    contains_captcha: /(captcha|recaptcha|hcaptcha)/i.test(formHtml),
  };
};

const extractTitle = (html) => stripTags(String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");

const withTimeout = async (promise, timeoutMs, timeoutMessage) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);

const fetchHtml = async (url) => {
  const response = await withTimeout(
    fetch(url, {
      headers: {
        "User-Agent": "HacknovaAutomationAgent/1.0",
      },
    }),
    CRAWL_TIMEOUT_MS,
    "Crawl timeout while fetching portal"
  );
  if (!response.ok) {
    throw new Error(`Failed to crawl portal: ${response.status}`);
  }
  return response.text();
};

const fetchRenderedHtmlWithPlaywright = async (url) => {
  if (!USE_PLAYWRIGHT_FALLBACK) return "";
  try {
    const playwright = await import("playwright");
    const chromium = playwright?.chromium;
    if (!chromium) return "";
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: CRAWL_TIMEOUT_MS });
      return await page.content();
    } finally {
      await browser.close().catch(() => {});
    }
  } catch {
    return "";
  }
};

const hashPayload = (payload) =>
  crypto.createHash("sha256").update(String(payload || "")).digest("hex");

export const crawlFormRepresentation = async (url) => {
  const html = await fetchHtml(url);
  const labelLookup = extractLabelLookup(html);
  let formTags = String(html).match(/<form\b[\s\S]*?<\/form>/gi) || [];

  // Optional JS-rendered fallback for portals that hydrate forms client-side.
  if (formTags.length === 0) {
    const renderedHtml = await fetchRenderedHtmlWithPlaywright(url);
    if (renderedHtml) {
      formTags = String(renderedHtml).match(/<form\b[\s\S]*?<\/form>/gi) || [];
    }
  }

  let forms = formTags.map((formTag) => parseForm(formTag, labelLookup, url));
  if (forms.length === 0) {
    const looseFields = parseLooseFields(html, labelLookup);
    if (looseFields.length > 0) {
      forms = [
        {
          id: "",
          name: "",
          method: "GET",
          action: url,
          form_kind: "application",
          fields: looseFields,
          input_fields: looseFields.filter((field) => field.tag === "input" && field.type !== "file"),
          dropdown_fields: looseFields.filter((field) => field.tag === "select"),
          file_upload_fields: looseFields.filter((field) => field.type === "file"),
          submit_buttons: [],
          contains_captcha: /(captcha|recaptcha|hcaptcha)/i.test(html),
        },
      ];
    }
  }
  const pageText = normalize(stripTags(html));
  const globalCaptchaDetected =
    /(captcha|recaptcha|hcaptcha)/i.test(html) || pageText.includes("i am not a robot");

  return {
    page_url: url,
    page_title: extractTitle(html),
    forms,
    detected: {
      login_forms: forms.filter((form) => form.form_kind === "login").length,
      signup_forms: forms.filter((form) => form.form_kind === "signup").length,
      application_forms: forms.filter((form) => form.form_kind === "application").length,
      file_upload_fields: forms.reduce((count, form) => count + form.file_upload_fields.length, 0),
      has_captcha: globalCaptchaDetected || forms.some((form) => form.contains_captcha),
    },
    crawl_hash: hashPayload(html),
    crawled_at: new Date().toISOString(),
  };
};
