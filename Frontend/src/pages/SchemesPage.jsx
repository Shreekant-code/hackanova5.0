import { Bot, ExternalLink, Play, RefreshCw, Search, AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import SectionCard from "../components/common/SectionCard.jsx";
import Spinner from "../components/common/Spinner.jsx";
import SchemeCard from "../components/schemes/SchemeCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { automationApi, documentApi, schemeApi } from "../services/api.js";
import { pushExtensionPayload } from "../utils/extensionBridge.js";

// --- Helper Functions (Fixed & Included) ---

const buildProfileRecommendationKey = (profile = null) => {
  if (!profile || typeof profile !== "object") return "";
  const state = String(profile?.location?.state || profile?.state || "").trim().toLowerCase();
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
  const merged = { ...userProfile };
  documents.forEach((doc) => {
    const dataSources = [doc?.extracted_data, doc?.autofill_fields, doc?.dynamic_schema?.autofill_payload];
    dataSources.forEach(source => {
      if (source && typeof source === 'object') {
        Object.entries(source).forEach(([key, value]) => {
          if (!merged[key]) merged[key] = value;
        });
      }
    });
  });
  return merged;
};

// --- Main Component ---

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
  const profileRecommendationKey = useMemo(() => buildProfileRecommendationKey(profile), [profile]);

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
      toast.success("Refreshed.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) { await fetchRecommendations(); return; }
    try {
      setSearching(true);
      const resp = await schemeApi.searchSchemes({ query: query.trim(), occupation: profile?.occupation, gender: profile?.gender });
      setSchemes(resp?.recommendations || []);
    } catch (err) { toast.error("Search failed"); } finally { setSearching(false); }
  };

  const handleApply = async (scheme) => {
    const applyLink = scheme.apply_link || scheme.original_apply_link || scheme.scheme_link || "";
    if (!applyLink) return toast.error("No link available");

    setApplyingSchemeName(scheme.scheme_name || "");
    try {
      const userProfile = buildUserProfileForAutomation({ user, profile });
      const docsResponse = await documentApi.getMyDocuments();
      const documents = docsResponse?.documents || [];
      const autofillData = buildAutofillData({ userProfile, documents });

      const previewResponse = await automationApi.previewPlan({
        scheme_data: { scheme_name: scheme.scheme_name, official_application_link: applyLink },
        user_profile: userProfile,
        documents,
      }).catch(() => null);

      setPreview(previewResponse);
      pushExtensionPayload({ scheme, user_profile: userProfile, autofill_data: autofillData, documents, automation_preview: previewResponse });
      window.open(applyLink, "_blank", "noopener,noreferrer");
      toast.success("Portal opened.");
    } catch (error) {
      toast.error("Apply failed.");
    } finally {
      setApplyingSchemeName("");
    }
  };

  if (loading) return (
    <div className="flex min-h-[50vh] items-center justify-center p-6 text-center">
      <Spinner label="Finding best schemes for you..." size="lg" />
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* --- Recommendations --- */}
      <SectionCard
        title="Recommended Schemes"
        subtitle="AI matches based on your specific profile and documents."
        action={
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
      >
        {!hasProfile && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm leading-relaxed">
              <strong>Incomplete Profile:</strong> Set up your profile in the Dashboard to unlock accurate AI recommendations.
            </p>
          </div>
        )}

        {/* Responsive Form */}
        <form onSubmit={handleSearch} className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schemes..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="w-full shrink-0 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95 sm:w-auto"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {/* Schemes Grid - Responsive columns and text handling */}
        {schemes.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-100 py-16 text-center">
            <Bot className="mx-auto h-12 w-12 text-slate-200" />
            <p className="mt-2 text-sm text-slate-500">No schemes matched your current profile.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {schemes.map((s) => (
              <div key={s.scheme_name} className="break-inside-avoid">
                <SchemeCard
                  scheme={s}
                  applying={applyingSchemeName === s.scheme_name}
                  onApply={handleApply}
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* --- Automation Preview --- */}
      <SectionCard 
        title="Automation Workflow" 
        subtitle="Real-time field mapping and preview."
      >
        {preview ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-slate-50 p-4 border border-slate-100">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {preview.session_id ? `Session: ${preview.session_id}` : "Plan Ready"}
                </p>
                <p className="text-xs text-slate-500">Mapped {preview.actions?.length || 0} fields from your documents.</p>
              </div>
              <button className="w-full sm:w-auto shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800">
                Run Autofill
              </button>
            </div>

            {/* Grid for small boxes - Responsive Columns */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-4 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Step Preview</p>
                <div className="mt-2 space-y-1.5 overflow-hidden">
                  {preview.actions?.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-slate-600 capitalize">{a.type}</span>
                      <span className="shrink-0 font-mono text-blue-600 bg-blue-50 px-1 rounded truncate max-w-[80px]">
                        {a.field || "UI"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Warnings</p>
                <p className="mt-2 text-xs text-amber-700 leading-tight">
                  {preview.warnings?.[0] || "No critical issues detected in form mapping."}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 sm:col-span-2 lg:col-span-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Target Portal</p>
                <a 
                  href={preview?.safety?.normalized_url || "#"} 
                  target="_blank" 
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline truncate"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  Visit Official Link
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-slate-500">
            <Bot className="h-10 w-10 text-slate-200" />
            <p className="text-sm">Click <b>Apply</b> on a scheme to see the automation plan.</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default SchemesPage;