const contextText = document.getElementById("contextText");
const profileText = document.getElementById("profileText");
const recommendationText = document.getElementById("recommendationText");
const lastRunText = document.getElementById("lastRunText");
const matchingText = document.getElementById("matchingText");
const statusText = document.getElementById("statusText");
const syncBtn = document.getElementById("syncBtn");
const fillBtn = document.getElementById("fillBtn");
const clearBtn = document.getElementById("clearBtn");

const sendMessage = (payload) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }
      resolve(response || { ok: false });
    });
  });

const setStatus = (message, tone = "normal") => {
  statusText.textContent = message || "";
  statusText.style.color = tone === "error" ? "#b91c1c" : tone === "success" ? "#166534" : "#334155";
};

const textValue = (value) => String(value ?? "").trim();

const clearNode = (node) => {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
};

const renderMatchingInsights = (result = null) => {
  if (!matchingText) return;
  const insights = Array.isArray(result?.matching_insights) ? result.matching_insights : [];
  clearNode(matchingText);

  if (insights.length === 0) {
    matchingText.textContent = "No matching insights yet. Run autofill once.";
    return;
  }

  const shown = insights.slice(0, 8);
  shown.forEach((item, index) => {
    const field = textValue(item?.field || "field");
    const source = textValue(item?.source_key || "");
    const reason = textValue(item?.reason || "");
    const valuePreview = textValue(item?.value_preview || "");
    const line = document.createElement("p");
    line.className = "matchingItem";
    line.textContent = `${index + 1}. ${field}${source ? ` <- ${source}` : ""}${
      valuePreview ? ` = ${valuePreview}` : ""
    }${reason ? ` | ${reason}` : ""}`;
    matchingText.appendChild(line);
  });

  if (insights.length > shown.length) {
    const hint = document.createElement("p");
    hint.className = "matchingHint";
    hint.textContent = `Showing ${shown.length} of ${insights.length} matching decisions.`;
    matchingText.appendChild(hint);
  }
};

const buildProfileSummary = (payload = {}) => {
  const profile = payload?.user_profile && typeof payload.user_profile === "object"
    ? payload.user_profile
    : payload?.profile_data && typeof payload.profile_data === "object"
      ? payload.profile_data
      : {};

  const occupation = textValue(profile?.occupation);
  const category = textValue(profile?.category);
  const gender = textValue(profile?.gender);
  const state = textValue(profile?.state || profile?.location?.state);
  const income = textValue(profile?.annual_income ?? profile?.income);

  const parts = [
    occupation ? `Occupation: ${occupation}` : "",
    category ? `Category: ${category}` : "",
    gender ? `Gender: ${gender}` : "",
    state ? `State: ${state}` : "",
    income ? `Income: ${income}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" | ") : "No profile fields found in current context.";
};

const buildRecommendationSummary = (payload = {}) => {
  const meta =
    payload?.recommendation_meta && typeof payload.recommendation_meta === "object"
      ? payload.recommendation_meta
      : {};
  const total = Number(meta?.total_recommendations || 0);
  const bestMatch = textValue(meta?.best_match || meta?.selected_scheme);
  const score = Number(meta?.best_match_score ?? meta?.selected_match_probability ?? 0);
  const source = textValue(meta?.source || payload?.context_origin);
  const signature = textValue(meta?.profile_signature);

  const parts = [
    source ? `Source: ${source}` : "",
    total > 0 ? `Total: ${total}` : "",
    bestMatch ? `Best: ${bestMatch}` : "",
    Number.isFinite(score) && score > 0 ? `Score: ${score}%` : "",
    signature ? `Profile Key: ${signature}` : "",
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join(" | ")
    : "Using latest profile + extracted documents for recommendation context.";
};

const refreshContext = async () => {
  const response = await sendMessage({ type: "get_autofill_context" });
  if (!response?.ok || !response?.envelope) {
    contextText.textContent = "No cached context yet. Use Sync, or click Fill to auto-bootstrap from your app login.";
    profileText.textContent = "No profile context yet.";
    recommendationText.textContent = "No recommendation context yet.";
    fillBtn.disabled = false;
    return;
  }

  const payload = response.envelope.payload || {};
  const schemeName = payload?.scheme?.scheme_name || "Unnamed scheme";
  const createdAt = response.envelope.created_at || "";
  const source = payload?.context_origin ? ` | ${payload.context_origin}` : "";
  contextText.textContent = `${schemeName}${createdAt ? ` | ${new Date(createdAt).toLocaleString()}` : ""}${source}`;
  profileText.textContent = buildProfileSummary(payload);
  recommendationText.textContent = buildRecommendationSummary(payload);
  fillBtn.disabled = false;
};

const refreshLastRun = async () => {
  const response = await sendMessage({ type: "get_last_autofill_result" });
  if (!response?.ok || !response?.result) {
    lastRunText.textContent = "No run result yet.";
    renderMatchingInsights(null);
    return;
  }
  const result = response.result;
  const status = result.ok ? "Success" : "Failed";
  const count = Array.isArray(result?.actions) ? result.actions.length : Number(result.filled_count || 0);
  const when = result.executed_at ? new Date(result.executed_at).toLocaleTimeString() : "";
  const placeholderStats =
    result?.placeholder_crawl && typeof result.placeholder_crawl === "object"
      ? result.placeholder_crawl
      : {};
  const placeholderPart =
    Number(placeholderStats.total_fields_scanned || 0) > 0
      ? ` | Placeholder ${Number(placeholderStats.fields_with_placeholder || 0)}/${Number(
          placeholderStats.total_fields_scanned || 0
        )} (N${Number(placeholderStats.native_placeholder_fields || 0)} D${Number(
          placeholderStats.derived_placeholder_fields || 0
        )})`
      : "";
  lastRunText.textContent = `${status}${count ? ` | ${count} actions` : ""}${placeholderPart}${
    when ? ` | ${when}` : ""
  }`;
  renderMatchingInsights(result);
};

fillBtn.addEventListener("click", async () => {
  fillBtn.disabled = true;
  setStatus("Running autofill and document upload...");
  const response = await sendMessage({ type: "autofill_active_tab" });

  if (!response?.ok) {
    setStatus(response?.error || "Autofill failed", "error");
    fillBtn.disabled = false;
    return;
  }

  const count = Array.isArray(response?.actions) ? response.actions.length : Number(response?.filled_count || 0);
  setStatus(`Autofill done. ${count} action(s).`, "success");
  fillBtn.disabled = false;
  await refreshLastRun();
});

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  setStatus("Syncing context from app/backend...");
  const response = await sendMessage({ type: "sync_context_from_app" });
  if (!response?.ok) {
    setStatus(response?.error || "Sync failed", "error");
    syncBtn.disabled = false;
    return;
  }
  setStatus("Context synced.", "success");
  await refreshContext();
  syncBtn.disabled = false;
});

clearBtn.addEventListener("click", async () => {
  await sendMessage({ type: "clear_autofill_context" });
  setStatus("Context cleared.");
  await refreshContext();
  await refreshLastRun();
});

Promise.all([refreshContext(), refreshLastRun()]).catch(() => {
  contextText.textContent = "Unable to read context.";
  profileText.textContent = "Unable to read profile context.";
  recommendationText.textContent = "Unable to read recommendation context.";
  lastRunText.textContent = "Unable to read run result.";
  if (matchingText) matchingText.textContent = "Unable to read matching insights.";
  fillBtn.disabled = false;
});
