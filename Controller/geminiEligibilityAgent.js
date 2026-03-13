const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PRIMARY_MODEL = process.env.AGNO_MODEL_ID || "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";
const GEMINI_TIMEOUT_MS = 8000;
const NAME_BASED_PORTAL_HINTS = [
  {
    patterns: ["stand-up india", "stand up india"],
    url: "https://www.standupmitra.in",
  },
  {
    patterns: ["skill loan scheme", "skill loan"],
    url: "https://www.vidyalakshmi.co.in",
  },
  {
    patterns: ["post matric scholarship", "national overseas scholarship", "scholarship", "fellowship"],
    url: "https://scholarships.gov.in",
  },
  {
    patterns: ["kaushal vikas", "pmkvy", "skill development"],
    url: "https://www.skillindia.gov.in",
  },
  {
    patterns: ["suraksha bima", "jansuraksha", "pmsby"],
    url: "https://jansuraksha.gov.in",
  },
  {
    patterns: ["pension scheme for traders", "maandhan", "self employed persons"],
    url: "https://maandhan.in",
  },
  {
    patterns: ["emeritus fellowship", "ugc"],
    url: "https://www.ugc.ac.in",
  },
  {
    patterns: ["women scientist scheme"],
    url: "http://115.112.95.114/wosc/online/instructions.jsp",
  },
];

const cleanupUrl = (url) =>
  String(url || "")
    .trim()
    .replace(/[),.;]+$/g, "");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => toText(item)).join(" ");
  if (typeof value === "object") return Object.values(value).map((item) => toText(item)).join(" ");
  return String(value);
};

const isOfficialGovUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      /\.gov(\.|$)/.test(host) ||
      /gov\.in$/.test(host) ||
      /nic\.in$/.test(host) ||
      /ac\.in$/.test(host)
    );
  } catch {
    return false;
  }
};

const isMyschemeHost = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().endsWith("myscheme.gov.in");
  } catch {
    return false;
  }
};

const isMyschemeSchemePageUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith("myscheme.gov.in")) return false;
    return /^\/schemes\/[^/]+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
};

const isLikelyDocumentUrl = (url) => {
  try {
    const parsed = new URL(url);
    const lowerPath = parsed.pathname.toLowerCase();
    return (
      lowerPath.endsWith(".pdf") ||
      lowerPath.endsWith(".doc") ||
      lowerPath.endsWith(".docx") ||
      lowerPath.endsWith(".xls") ||
      lowerPath.endsWith(".xlsx")
    );
  } catch {
    return false;
  }
};

const toOriginUrl = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
};

const extractUrlsFromText = (text) => {
  const rawLinks = String(text || "").match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || [];
  const links = [];
  const seen = new Set();
  for (const link of rawLinks) {
    const normalized = cleanupUrl(link.startsWith("http") ? link : `https://${link}`);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    links.push(normalized);
  }
  return links;
};

const collectCandidateLinks = (applyLink, ...textNodes) => {
  const candidates = [];
  const seen = new Set();
  const push = (url) => {
    const normalized = cleanupUrl(url);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  if (applyLink) push(applyLink);
  textNodes.forEach((node) => {
    extractUrlsFromText(toText(node)).forEach((url) => push(url));
  });
  return candidates;
};

export const resolveSchemePageLink = (applyLink, ...textNodes) => {
  const candidates = collectCandidateLinks(applyLink, ...textNodes);
  for (const url of candidates) {
    if (isMyschemeSchemePageUrl(url)) return url;
  }
  return "";
};

export const resolveOriginalApplyLink = (applyLink, ...textNodes) => {
  const candidates = collectCandidateLinks(applyLink, ...textNodes);

  // Prefer official non-MyScheme application portal URLs.
  for (const url of candidates) {
    if (!isOfficialGovUrl(url)) continue;
    if (isMyschemeHost(url)) continue;
    if (isLikelyDocumentUrl(url)) continue;
    return url;
  }

  // If only official document links are present, return the source website root.
  for (const url of candidates) {
    if (!isOfficialGovUrl(url)) continue;
    if (isMyschemeHost(url)) continue;
    if (!isLikelyDocumentUrl(url)) continue;
    const origin = toOriginUrl(url);
    if (origin) return origin;
  }

  // Final best-effort from crawled data: non-MyScheme non-document URL.
  for (const url of candidates) {
    if (isMyschemeHost(url)) continue;
    if (isLikelyDocumentUrl(url)) continue;
    return url;
  }

  return "";
};

export const inferOriginalApplyLinkFromSchemeName = (schemeName, description = "") => {
  const text = `${String(schemeName || "")} ${String(description || "")}`.toLowerCase();
  for (const hint of NAME_BASED_PORTAL_HINTS) {
    if (hint.patterns.some((pattern) => text.includes(pattern))) {
      return hint.url;
    }
  }
  return "";
};

export const resolveBestOriginalApplyLink = (
  applyLink,
  schemeName = "",
  description = "",
  ...textNodes
) => {
  const resolved = resolveOriginalApplyLink(applyLink, ...textNodes);
  if (resolved) return resolved;
  return inferOriginalApplyLinkFromSchemeName(schemeName, description);
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

const normalizeMatchedConditions = (value) => {
  const source = value && typeof value === "object" ? value : {};
  return {
    occupation: Boolean(source.occupation),
    age: Boolean(source.age),
    income: Boolean(source.income),
    gender: Boolean(source.gender),
    state: Boolean(source.state),
    category: Boolean(source.category),
    eligibility_rule: Boolean(source.eligibility_rule),
  };
};

const validateAgentOutput = (raw, fallbackOriginalLink = "", schemePageLink = "") => {
  if (!raw || typeof raw !== "object") return null;

  const matched = normalizeMatchedConditions(raw.matched_conditions);
  const originalApplyLink = resolveOriginalApplyLink(raw.apply_link, raw.explanation) || fallbackOriginalLink;

  return {
    eligible: Boolean(raw.eligible),
    matched_conditions: matched,
    apply_link: originalApplyLink,
    scheme_page_link: schemePageLink,
    explanation: String(raw.explanation || "").trim(),
  };
};

const buildPrompt = (userProfile, scheme, schemePageLink) => {
  const inputPayload = {
    user_profile: {
      age: userProfile.age ?? null,
      occupation: userProfile.occupation ?? "",
      category: userProfile.category ?? "",
      annual_income: userProfile.annual_income ?? userProfile.income ?? null,
      gender: userProfile.gender ?? "",
      location: {
        state: userProfile.location?.state ?? "",
      },
    },
    scheme_data: {
      scheme_name: scheme.scheme_name ?? "",
      description: scheme.description ?? "",
      eligibility: scheme.eligibility ?? "",
      benefits: Array.isArray(scheme.benefits) ? scheme.benefits : [],
      documents_required: Array.isArray(scheme.documents_required) ? scheme.documents_required : [],
      application_process: scheme.application_process ?? "",
      scheme_page_link: schemePageLink,
      original_apply_link: scheme.original_apply_link ?? "",
      state: scheme.state ?? "",
      category: scheme.category ?? "",
      occupation: scheme.occupation ?? "",
      age_min: scheme.age_min ?? null,
      age_max: scheme.age_max ?? null,
    },
  };

  return `
You are an AI eligibility validation agent.
Use ONLY the provided JSON data. Do not invent any scheme detail.

Task:
1. Validate if user matches scheme eligibility.
2. Evaluate conditions: occupation, age, income, gender, state, category, eligibility_rule.
3. Return the ORIGINAL official application portal URL (not the MyScheme scheme page) in apply_link.
4. If no original official application portal URL exists in input data, return apply_link as empty string.
5. If profile clearly contradicts eligibility, set eligible=false.

Return JSON only in this exact format:
{
  "eligible": true,
  "matched_conditions": {
    "occupation": true,
    "age": true,
    "income": true,
    "gender": true,
    "state": true,
    "category": false,
    "eligibility_rule": true
  },
  "apply_link": "",
  "explanation": ""
}

Input JSON:
${JSON.stringify(inputPayload)}
`.trim();
};

const callGemini = async (modelId, prompt) => {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
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
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = safeJsonParse(text);
  if (!parsed) {
    throw new Error("Gemini returned non-JSON output");
  }
  return parsed;
};

export const validateEligibilityWithGemini = async (userProfile, scheme) => {
  if (!GEMINI_API_KEY) return null;

  const schemePageLink = resolveSchemePageLink(
    scheme.scheme_page_link || scheme.apply_link,
    scheme.application_process,
    scheme.description,
    scheme.scheme_name
  );
  const fallbackOriginalLink = resolveBestOriginalApplyLink(
    scheme.original_apply_link,
    scheme.scheme_name,
    scheme.description,
    scheme.application_process,
    scheme.description,
    scheme.documents_required,
    scheme.benefits
  );
  const prompt = buildPrompt(userProfile, scheme, schemePageLink);
  const models = PRIMARY_MODEL === FALLBACK_MODEL ? [PRIMARY_MODEL] : [PRIMARY_MODEL, FALLBACK_MODEL];

  for (const model of models) {
    try {
      const raw = await callGemini(model, prompt);
      const validated = validateAgentOutput(raw, fallbackOriginalLink, schemePageLink);
      if (validated) return validated;
    } catch {
      // try next model
    }
  }

  return null;
};
