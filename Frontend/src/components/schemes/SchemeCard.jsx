import { ArrowUpRight, BadgeCheck, FileCheck2 } from "lucide-react";

const SchemeCard = ({ scheme, onApply, applying = false }) => {
  const requiredDocs = Array.isArray(scheme.documents_required) ? scheme.documents_required : [];
  const benefits = Array.isArray(scheme.benefits) ? scheme.benefits : [];
  const applyLink = scheme.apply_link || scheme.original_apply_link || scheme.scheme_link || "";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{scheme.scheme_name || "Scheme"}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Match Score: {scheme.match_probability || 0}% | {scheme.reason || "Eligibility analysis"}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            scheme.eligible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          {scheme.eligible ? "Eligible" : "Check Eligibility"}
        </span>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Benefits</p>
          <p className="mt-1 text-slate-700">
            {benefits.length > 0 ? benefits.slice(0, 2).join(", ") : "Benefits not available"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Required Documents</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {requiredDocs.length > 0 ? (
              requiredDocs.map((doc) => (
                <span
                  key={doc}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600"
                >
                  <FileCheck2 className="h-3.5 w-3.5 text-blue-600" />
                  {doc}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">No document list available.</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!applyLink || applying}
          onClick={() => onApply?.(scheme)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <ArrowUpRight className="h-4 w-4" />
          {applying ? "Preparing..." : "Apply Scheme"}
        </button>

        {applyLink ? (
          <a
            href={applyLink}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            View official page
          </a>
        ) : (
          <span className="text-xs text-amber-600">Official link unavailable</span>
        )}
      </div>
    </article>
  );
};

export default SchemeCard;
