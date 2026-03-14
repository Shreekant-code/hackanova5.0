import { STORAGE_KEYS, writeJsonToStorage } from "./storage.js";

export const pushExtensionPayload = (payload) => {
  const envelope = {
    source: "gov-scheme-platform",
    type: "SCHEME_AUTOFILL_CONTEXT",
    created_at: new Date().toISOString(),
    payload,
  };

  writeJsonToStorage(STORAGE_KEYS.extensionPayload, envelope);

  if (typeof window !== "undefined") {
    window.postMessage(envelope, window.location.origin);
  }

  return envelope;
};
