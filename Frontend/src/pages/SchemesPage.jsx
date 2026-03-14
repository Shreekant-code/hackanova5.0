import { Bot, ExternalLink, Play, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import SectionCard from "../components/common/SectionCard.jsx";
import Spinner from "../components/common/Spinner.jsx";
import SchemeCard from "../components/schemes/SchemeCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { automationApi, documentApi, schemeApi } from "../services/api.js";
import { pushExtensionPayload } from "../utils/extensionBridge.js";

const buildProfileRecommendationKey = (profile = null) => {
  if (!profile || typeof profile !== "object") return "";
  const state = String(profile?.location?.state || profile?.state || "")
    .trim()
    .toLowerCase();
  const annualIncomeRaw = profile?.annual_income ?? profile?.income ?? "";
  const annualIncome = Number(annualIncomeRaw);
  return [
    `age:${String(profile?.age ?? "").trim().toLowerCase()}`,
    `occupation:${String(profile?.occupation || "").trim().toLowerCase()}`,
    `category:${String(profile?.category || "").trim().toLowerCase()}`,
    `income:${Number.isFinite(annualIncome) ? String(annualIncome) : ""}`,
    `gender:${String(profile?.gender || "").trim().toLowerCase()}`,
    `state:${state}`,
  ].join("|");
};

const buildUserProfileForAutomation = ({ user, profile }) => ({
  name: user?.name || "",
  date_of_birth: profile?.date_of_birth || "",
  age: profile?.age || "",
  gender: profile?.gender || "",
  occupation: profile?.occupation || "",
  income: profile?.annual_income || "",
  state: profile?.location?.state || "",
  category: profile?.category || "",
  aadhaar_number: profile?.aadhaar_number || "",
  pan_number: profile?.pan_number || "",
  bank_account: profile?.bank_account || "",
  ifsc_code: profile?.ifsc_code || "",
  address: profile?.address || "",
  email: user?.email || "",
  phone: profile?.phone || "",
});

const buildAutofillData = ({ userProfile = {}, documents = [] }) => {
  const merged = {
    ...userProfile,
  };

  documents.forEach((doc) => {
    const extracted = doc?.extracted_data || {};
    const autofill = doc?.autofill_fields || {};

    Object.entries(extracted).forEach(([key, value]) => {
      if (merged[key] === null || merged[key] === undefined || merged[key] === "") {
        merged[key] = value;
      }
    });

    Object.entries(autofill).forEach(([key, value]) => {
      if (merged[key] === null || merged[key] === undefined || merged[key] === "") {
        merged[key] = value;
      }
    });
  });

  if (!merged.name && merged.applicant_name) merged.name = merged.applicant_name;
  if (!merged.date_of_birth && merged.dob) merged.date_of_birth = merged.dob;
  if (!merged.aadhaar_number && merged.aadhaar) merged.aadhaar_number = merged.aadhaar;
  if (!merged.pan_number && merged.pan) merged.pan_number = merged.pan;
  if (!merged.bank_account && merged.account_number) merged.bank_account = merged.account_number;
  if (!merged.income && merged.annual_income) merged.income = merged.annual_income;
  return merged;
};

const SchemesPage = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [applyingSchemeName, setApplyingSchemeName] = useState("");
  const [query, setQuery] = useState("");
  const [schemes, setSchemes] = useState([]);
  const [preview, setPreview] = useState(null);
  const [executingFill, setExecutingFill] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [errorText, setErrorText] = useState("");

  const hasProfile = useMemo(() => Boolean(profile), [profile]);
  const profileRecommendationKey = useMemo(
    () => buildProfileRecommendationKey(profile),
    [profile]
  );

  const fetchRecommendations = async () => {
    if (!hasProfile) {
      setErrorText("");
      setSchemes([]);
      return;
    }
    try {
      setErrorText("");
      const response = await schemeApi.getRecommendations(profileRecommendationKey);
      setSchemes(response?.recommendations || []);
    } catch (error) {
      setSchemes([]);
      setErrorText(error.message || "Failed to load schemes.");
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchRecommendations();
      setLoading(false);
    };
    init();
  }, [profileRecommendationKey, hasProfile]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchRecommendations();
      toast.success("Recommendations refreshed.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!query.trim()) {
      await fetchRecommendations();
      return;
    }
    try {
      setSearching(true);
      const response = await schemeApi.searchSchemes({
        query: query.trim(),
        occupation: profile?.occupation || "",
        gender: profile?.gender || "",
      });
      setSchemes(response?.recommendations || []);
      toast.success("Search completed.");
    } catch (error) {
      toast.error(error.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const handleApply = async (scheme) => {
    const applyLink = scheme.apply_link || scheme.original_apply_link || scheme.scheme_link || "";
    if (!applyLink) {
      toast.error("Official application link not available for this scheme.");
      return;
    }

    setApplyingSchemeName(scheme.scheme_name || "");
    try {
      const userProfile = buildUserProfileForAutomation({ user, profile });
      const docsResponse = await documentApi.getMyDocuments();
      const documents = (docsResponse?.documents || []).map((doc) => ({
        document_name: doc.document_name,
        cloudinary_url: doc.cloudinary_url,
        extracted_data: doc.extracted_data || {},
        autofill_fields: doc.autofill_fields || {},
      }));
      const autofillData = buildAutofillData({
        userProfile,
        documents,
      });

      let previewResponse = null;
      try {
        previewResponse = await automationApi.previewPlan({
          scheme_data: {
            scheme_name: scheme.scheme_name || "",
            official_application_link: applyLink,
            documents_required: scheme.documents_required || [],
            eligibility_conditions: [],
          },
          user_profile: userProfile,
          documents,
          generate_fallback_guide: true,
        });
      } catch (error) {
        toast.warning(
          error.message || "Could not generate automation preview. You can still continue manually."
        );
      }

      setPreview(previewResponse);
      setExecutionResult(null);

      pushExtensionPayload({
        scheme: {
          scheme_name: scheme.scheme_name || "",
          official_application_link: applyLink,
          documents_required: scheme.documents_required || [],
        },
        user_profile: userProfile,
        autofill_data: autofillData,
        documents,
        recommendation_meta: {
          source: "frontend_selected_scheme",
          selected_scheme: scheme.scheme_name || "",
          selected_match_probability: Number(scheme.match_probability || 0),
          total_recommendations: schemes.length,
          profile_signature: profileRecommendationKey,
        },
        automation_preview: previewResponse
          ? {
              session_id: previewResponse.session_id || "",
              actions: previewResponse.actions || [],
              warnings: previewResponse.warnings || [],
            }
          : null,
      });

      window.open(applyLink, "_blank", "noopener,noreferrer");
      toast.success("Official portal opened in new tab. Extension context is ready.");
    } catch (error) {
      toast.error(error.message || "Failed to start apply workflow.");
    } finally {
      setApplyingSchemeName("");
    }
  };

  const handleFillAfterReview = async () => {
    if (!preview?.session_id || !preview?.confirm_token) {
      toast.error("Preview session not ready. Click Apply first.");
      return;
    }

    try {
      setExecutingFill(true);
      const result = await automationApi.executePlan({
        session_id: preview.session_id,
        confirm_token: preview.confirm_token,
        confirm_submission: false,
        dry_run_fill_only: true,
        force_simulation: false,
      });

      setExecutionResult(result);
      if (result.simulation) {
        toast.info("Fill steps executed in simulation mode. Set playwright mode for real browser fill.");
      } else {
        toast.success("Autofill completed. Submit remains skipped.");
      }
    } catch (error) {
      toast.error(error.message || "Autofill execution failed.");
    } finally {
      setExecutingFill(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading scheme recommendations..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Recommended Schemes"
        subtitle="Select a scheme and launch guided apply workflow on official portals."
        action={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      >
        {!hasProfile ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            Save your profile first from Dashboard to improve recommendation quality and autofill mappings.
          </p>
        ) : null}

        <form onSubmit={handleSearch} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search schemes by keyword..."
              className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
        <p className="mb-4 text-xs text-slate-500">
          Recommendations auto-refresh when profile setup values change.
        </p>

        {errorText ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {errorText}
          </p>
        ) : null}

        {schemes.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No schemes available for current profile/query.
          </p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {schemes.map((scheme) => (
              <SchemeCard
                key={scheme.scheme_name}
                scheme={scheme}
                applying={applyingSchemeName === scheme.scheme_name}
                onApply={handleApply}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {preview ? (
        <SectionCard
          title="Last Automation Preview"
          subtitle="Generated by backend automation planner before execution."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFillAfterReview}
              disabled={executingFill}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Play className="h-4 w-4" />
              {executingFill ? "Running Fill..." : "Fill After Review (No Submit)"}
            </button>
            <p className="self-center text-xs text-slate-500">
              Uses `dry_run_fill_only=true` so final submit is skipped.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{preview.session_id || "N/A"}</p>
              <p className="mt-2 text-xs text-slate-600">
                Actions prepared: {Array.isArray(preview.actions) ? preview.actions.length : 0}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warnings</p>
              {Array.isArray(preview.warnings) && preview.warnings.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-700">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-emerald-700">No warnings reported.</p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Planned Actions</p>
            {Array.isArray(preview.actions) && preview.actions.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {preview.actions.slice(0, 8).map((action, idx) => (
                  <p key={`${action.type}-${idx}`} className="text-sm text-slate-700">
                    {idx + 1}. {action.type} {action.field ? `(${action.field})` : ""}
                  </p>
                ))}
                {preview.actions.length > 8 ? (
                  <p className="text-xs text-slate-500">...and {preview.actions.length - 8} more actions</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No actions generated.</p>
            )}
          </div>

          {executionResult ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fill Execution Result</p>
              <p className="mt-1 text-sm text-slate-700">
                Status:{" "}
                <span className="font-semibold">
                  {executionResult.success ? "Success" : "Failed"} | {executionResult.simulation ? "Simulation" : "Real Browser"}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Steps logged: {Array.isArray(executionResult.execution_logs) ? executionResult.execution_logs.length : 0}
              </p>
            </div>
          ) : null}

          <a
            href={preview?.safety?.normalized_url || "#"}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            Open preview portal link
          </a>
        </SectionCard>
      ) : (
        <SectionCard
          title="Automation Preview"
          subtitle="Click Apply on a scheme to generate field mappings, upload matches, and steps."
        >
          <p className="inline-flex items-center gap-2 text-sm text-slate-600">
            <Bot className="h-4 w-4 text-blue-600" />
            Preview data will appear here after selecting a scheme.
          </p>
        </SectionCard>
      )}
    </div>
  );
};

export default SchemesPage;
