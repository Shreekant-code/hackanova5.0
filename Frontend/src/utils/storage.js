export const STORAGE_KEYS = {
  authToken: "gov_platform_token",
  authUser: "gov_platform_user",
  userProfile: "gov_platform_profile",
  extensionPayload: "gov_platform_extension_payload",
};

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

export const readFromStorage = (key, fallback = "") => {
  if (!hasStorage()) return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value;
};

export const writeToStorage = (key, value) => {
  if (!hasStorage()) return;
  window.localStorage.setItem(key, value);
};

export const removeFromStorage = (key) => {
  if (!hasStorage()) return;
  window.localStorage.removeItem(key);
};

export const readJsonFromStorage = (key, fallback = null) => {
  const raw = readFromStorage(key, "");
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const writeJsonToStorage = (key, value) => {
  writeToStorage(key, JSON.stringify(value));
};
