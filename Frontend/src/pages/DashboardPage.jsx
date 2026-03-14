import { ArrowRight, FileText, Sparkles, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SectionCard from "../components/common/SectionCard.jsx";
import Spinner from "../components/common/Spinner.jsx";
import ProfileForm from "../components/forms/ProfileForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { documentApi, schemeApi } from "../services/api.js";

const StatTile = ({ title, value, subtitle }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
  </div>
);

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

const DashboardPage = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [errorText, setErrorText] = useState("");
  const profileRecommendationKey = useMemo(
    () => buildProfileRecommendationKey(profile),
    [profile]
  );

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setErrorText("");

      try {
        const [schemeResponse, docsResponse] = await Promise.allSettled([
          profile
            ? schemeApi.getRecommendations(profileRecommendationKey)
            : Promise.resolve({ recommendations: [] }),
          documentApi.getMyDocuments(),
        ]);

        if (!profile) {
          setRecommendations([]);
        } else if (schemeResponse.status === "fulfilled") {
          setRecommendations(schemeResponse.value?.recommendations || []);
        } else {
          setRecommendations([]);
          setErrorText(schemeResponse.reason?.message || "Could not fetch recommendations yet.");
        }

        if (docsResponse.status === "fulfilled") {
          setDocuments(docsResponse.value?.documents || []);
        } else {
          setDocuments([]);
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [profileRecommendationKey, profile]);

  const profileStatus = useMemo(() => {
    if (profile) return "Profile ready";
    return "Profile not saved yet";
  }, [profile]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading dashboard..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/80">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Dashboard</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">Hello, {user?.name || "Applicant"}</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Track profile, recommended schemes, and document extraction status before applying on official
          portals.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          title="Profile"
          value={profile ? "Ready" : "Pending"}
          subtitle={profileStatus}
        />
        <StatTile
          title="Recommendations"
          value={recommendations.length}
          subtitle="Best matching schemes"
        />
        <StatTile title="Documents" value={documents.length} subtitle="Uploaded and processed" />
        <StatTile
          title="Next Step"
          value={recommendations.length > 0 ? "Apply" : "Profile"}
          subtitle={recommendations.length > 0 ? "Open scheme portal" : "Complete profile"}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <SectionCard
          className="xl:col-span-3"
          title="Profile Setup"
          subtitle="Save profile once. It will be used for recommendations, extraction context, and autofill plan."
        >
          <ProfileForm />
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          title="Quick Actions"
          subtitle="Jump directly to upload or scheme pages."
        >
          <div className="space-y-3">
            <Link
              to="/schemes"
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                View Recommended Schemes
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/documents"
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <Upload className="h-4 w-4 text-blue-600" />
                Upload & Extract Documents
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4" />
                Automation Reminder
              </p>
              <p className="mt-1">
                The system prepares fill steps and keeps final submission under your control.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Recent Recommendations"
        subtitle="Top 3 schemes from recommendation engine."
        action={
          <Link to="/schemes" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            View all
          </Link>
        }
      >
        {errorText ? <p className="mb-3 text-sm text-amber-700">{errorText}</p> : null}

        {recommendations.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No recommendations yet. Save profile and recommendations will refresh automatically.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {recommendations.slice(0, 3).map((scheme) => (
              <div key={scheme.scheme_name} className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">{scheme.scheme_name}</h3>
                <p className="mt-1 text-xs text-slate-500">{scheme.reason || "Eligibility analysis"}</p>
                <p className="mt-3 text-xs font-medium text-blue-700">
                  Match: {scheme.match_probability || 0}%
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default DashboardPage;
