const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const DEFAULT_OFFICIAL_SUFFIXES = [".gov.in", ".nic.in", ".gov", ".ac.in"];
const extraSuffixes = String(process.env.OFFICIAL_PORTAL_SUFFIXES || "")
  .split(",")
  .map((item) => normalize(item))
  .filter(Boolean);
const explicitHosts = String(process.env.OFFICIAL_PORTAL_HOSTS || "")
  .split(",")
  .map((item) => normalize(item))
  .filter(Boolean);

const OFFICIAL_SUFFIXES = Array.from(new Set([...DEFAULT_OFFICIAL_SUFFIXES, ...extraSuffixes]));
const BLOCKED_PROTOCOLS = new Set(["javascript:", "data:", "file:"]);

export const normalizePortalUrl = (url) => {
  try {
    const parsed = new URL(String(url || "").trim());
    return parsed.toString();
  } catch {
    return "";
  }
};

export const isOfficialGovernmentPortal = (url) => {
  const normalized = normalizePortalUrl(url);
  if (!normalized) return false;
  const parsed = new URL(normalized);
  const protocol = normalize(parsed.protocol);
  if (BLOCKED_PROTOCOLS.has(protocol)) return false;
  if (protocol !== "https:" && protocol !== "http:") return false;

  const host = normalize(parsed.hostname);
  if (explicitHosts.includes(host)) return true;
  return OFFICIAL_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
};

export const getPortalSafetyReport = (url) => {
  const normalized = normalizePortalUrl(url);
  if (!normalized) {
    return {
      allowed: false,
      normalized_url: "",
      reason: "Invalid application URL",
    };
  }

  const parsed = new URL(normalized);
  const protocol = normalize(parsed.protocol);
  if (BLOCKED_PROTOCOLS.has(protocol)) {
    return {
      allowed: false,
      normalized_url: normalized,
      reason: "Blocked URL protocol",
    };
  }

  if (!isOfficialGovernmentPortal(normalized)) {
    return {
      allowed: false,
      normalized_url: normalized,
      reason: "Non-official application portal blocked by policy",
    };
  }

  return {
    allowed: true,
    normalized_url: normalized,
    reason: "Official government portal verified",
  };
};
