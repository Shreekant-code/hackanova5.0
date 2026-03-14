import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import SectionCard from "../components/common/SectionCard.jsx";
import Spinner from "../components/common/Spinner.jsx";
import DocumentUploadPanel from "../components/documents/DocumentUploadPanel.jsx";
import { documentApi, schemeApi } from "../services/api.js";

const formatExtractedFields = (extracted) => {
  if (!extracted || typeof extracted !== "object") return [];
  return Object.entries(extracted).filter(([, value]) => value !== null && value !== undefined && value !== "");
};

const DocumentsPage = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schemes, setSchemes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [requiredStatus, setRequiredStatus] = useState(null);
  const [selectedSchemeName, setSelectedSchemeName] = useState("");

  const selectedScheme = useMemo(
    () => schemes.find((scheme) => scheme.scheme_name === selectedSchemeName) || null,
    [schemes, selectedSchemeName]
  );

  const fetchPageData = useCallback(async () => {
    const [schemeResult, docsResult] = await Promise.allSettled([
      schemeApi.getRecommendations(),
      documentApi.getMyDocuments(),
    ]);

    if (schemeResult.status === "fulfilled") {
      const rows = schemeResult.value?.recommendations || [];
      setSchemes(rows);
      setSelectedSchemeName((current) => current || rows[0]?.scheme_name || "");
    } else {
      setSchemes([]);
    }

    if (docsResult.status === "fulfilled") {
      setDocuments(docsResult.value?.documents || []);
    } else {
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await fetchPageData();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [fetchPageData]);

  const refreshDocuments = async () => {
    setRefreshing(true);
    try {
      const response = await documentApi.getMyDocuments();
      setDocuments(response?.documents || []);
    } catch (error) {
      toast.error(error.message || "Failed to refresh documents.");
    } finally {
      setRefreshing(false);
    }
  };

  const fetchRequiredStatus = async () => {
    if (!selectedScheme) {
      toast.info("Select a scheme first.");
      return;
    }
    try {
      const response = await documentApi.getRequiredStatus({
        scheme_name: selectedScheme.scheme_name,
        documents_required: selectedScheme.documents_required || [],
      });
      setRequiredStatus(response);
      toast.success("Required document status updated.");
    } catch (error) {
      toast.error(error.message || "Could not fetch required document status.");
    }
  };

  const handleUploadDone = async (_, selectedSchemeFromUpload) => {
    await refreshDocuments();
    const schemeToCheck = selectedSchemeFromUpload || selectedScheme;
    if (!schemeToCheck) return;
    try {
      const response = await documentApi.getRequiredStatus({
        scheme_name: schemeToCheck.scheme_name,
        documents_required: schemeToCheck.documents_required || [],
      });
      setRequiredStatus(response);
    } catch {
      // keep silent because upload already succeeded
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading document center..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Document Upload & Extraction"
        subtitle="Upload files, send to Cloudinary via backend, extract fields, and store for autofill."
      >
        <DocumentUploadPanel schemes={schemes} onUploaded={handleUploadDone} />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-5">
        <SectionCard
          className="xl:col-span-2"
          title="Required Documents Check"
          subtitle="Compare uploaded docs against selected scheme requirements."
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Scheme</span>
            <select
              value={selectedSchemeName}
              onChange={(event) => setSelectedSchemeName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            >
              <option value="">Select scheme</option>
              {schemes.map((scheme) => (
                <option key={scheme.scheme_name} value={scheme.scheme_name}>
                  {scheme.scheme_name}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fetchRequiredStatus}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Check Required Status
            </button>
          </div>

          {requiredStatus?.required_documents?.length ? (
            <div className="mt-4 space-y-2">
              {requiredStatus.required_documents.map((row) => (
                <div
                  key={row.document_name}
                  className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm"
                >
                  <p className="max-w-[75%] text-slate-700">{row.document_name}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      row.uploaded ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {row.uploaded ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Uploaded
                      </>
                    ) : (
                      <>
                        <CircleAlert className="h-3.5 w-3.5" />
                        Missing
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Select scheme and click "Check Required Status" to see missing documents.
            </p>
          )}
        </SectionCard>

        <SectionCard
          className="xl:col-span-3"
          title="Uploaded Documents"
          subtitle="Latest extracted documents from your account."
          action={
            <button
              type="button"
              onClick={refreshDocuments}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          }
        >
          {documents.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No documents uploaded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc, idx) => (
                <article key={`${doc.document_name}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">{doc.document_name}</h3>
                    <a
                      href={doc.cloudinary_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Open file
                    </a>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {formatExtractedFields(doc.extracted_data).length > 0 ? (
                      formatExtractedFields(doc.extracted_data).map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                          <p className="font-semibold uppercase tracking-wide text-slate-500">{key}</p>
                          <p className="mt-0.5 text-slate-700">{String(value)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">No extracted data available.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default DocumentsPage;
