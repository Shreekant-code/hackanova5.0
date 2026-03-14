import { CloudUpload, FileText, LoaderCircle, UploadCloud, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "../../context/AuthContext.jsx";
import { documentApi } from "../../services/api.js";

const inferDocumentNameFromFile = (fileName = "") =>
  String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toUploadEntries = (inputFiles = [], requiredDocs = []) =>
  Array.from(inputFiles || [])
    .filter(Boolean)
    .map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      file,
      documentName: String(requiredDocs?.[index] || inferDocumentNameFromFile(file.name) || "").trim(),
    }));

const DocumentUploadPanel = ({ schemes = [], onUploaded }) => {
  const { profile } = useAuth();
  const [selectedSchemeName, setSelectedSchemeName] = useState("");
  const [entries, setEntries] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeUploadIndex, setActiveUploadIndex] = useState(0);

  const selectedScheme = useMemo(
    () => schemes.find((scheme) => scheme.scheme_name === selectedSchemeName) || null,
    [schemes, selectedSchemeName]
  );

  const requiredDocs = useMemo(
    () => (Array.isArray(selectedScheme?.documents_required) ? selectedScheme.documents_required : []),
    [selectedScheme]
  );

  const onPickFiles = (nextFiles) => {
    const picked = toUploadEntries(nextFiles, requiredDocs);
    if (picked.length === 0) return;

    setEntries((prev) => {
      const next = [...prev];
      const existingIds = new Set(next.map((item) => item.id));
      picked.forEach((item) => {
        if (existingIds.has(item.id)) return;
        next.push(item);
        existingIds.add(item.id);
      });
      return next;
    });
  };

  const onFileChange = (event) => {
    onPickFiles(event.target.files || []);
    event.target.value = "";
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    onPickFiles(event.dataTransfer.files || []);
  };

  const onChangeDocumentName = (id, value) => {
    setEntries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, documentName: value } : item))
    );
  };

  const removeEntry = (id) => {
    setEntries((prev) => prev.filter((item) => item.id !== id));
  };

  const assignRequiredDocName = (docName) => {
    setEntries((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const targetIndex = next.findIndex((item) => !String(item.documentName || "").trim());
      const indexToUse = targetIndex >= 0 ? targetIndex : 0;
      next[indexToUse] = {
        ...next[indexToUse],
        documentName: docName,
      };
      return next;
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (entries.length === 0) {
      toast.error("Please select at least one file to upload.");
      return;
    }
    const invalidEntry = entries.find((item) => !String(item.documentName || "").trim());
    if (invalidEntry) {
      toast.error(`Document name is required for ${invalidEntry.file?.name || "selected file"}.`);
      return;
    }

    const schemeData = selectedScheme
      ? {
          scheme_name: selectedScheme.scheme_name || "",
          documents_required: selectedScheme.documents_required || [],
        }
      : {
          scheme_name: "",
        documents_required: [],
        };

    try {
      setUploading(true);
      setUploadProgress(0);
      setActiveUploadIndex(0);
      const total = entries.length;
      const successResponses = [];
      const failedEntries = [];

      for (let index = 0; index < total; index += 1) {
        const entry = entries[index];
        setActiveUploadIndex(index + 1);

        try {
          const response = await documentApi.uploadAndProcessDocument(
            {
              file: entry.file,
              documentName: String(entry.documentName || "").trim(),
              schemeData,
              userProfile: profile || {},
              fileType: entry.file?.type || "",
            },
            {
              onUploadProgress: (progressEvent) => {
                if (!progressEvent.total) return;
                const fileProgress = progressEvent.loaded / progressEvent.total;
                const aggregate = ((index + fileProgress) / total) * 100;
                setUploadProgress(Math.max(0, Math.min(100, Math.round(aggregate))));
              },
            }
          );
          successResponses.push(response);
        } catch (error) {
          failedEntries.push({
            ...entry,
            errorMessage: error.message || "Upload failed",
          });
        }
      }

      setUploadProgress(100);
      if (successResponses.length > 0) {
        toast.success(
          `${successResponses.length}/${total} document(s) uploaded and processed successfully.`
        );
        onUploaded?.(successResponses, selectedScheme);
      }
      if (failedEntries.length > 0) {
        toast.error(
          `${failedEntries.length} document(s) failed. Please review and re-upload failed files.`
        );
      }
      setEntries(failedEntries);
    } catch (error) {
      toast.error(error.message || "Document upload failed.");
    } finally {
      setUploading(false);
      setActiveUploadIndex(0);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Scheme</span>
        <select
          value={selectedSchemeName}
          onChange={(event) => {
            const nextSchemeName = event.target.value;
            setSelectedSchemeName(nextSchemeName);
            const foundScheme = schemes.find((scheme) => scheme.scheme_name === nextSchemeName);
            const nextRequired = Array.isArray(foundScheme?.documents_required)
              ? foundScheme.documents_required
              : [];
            if (nextRequired.length === 0) return;
            setEntries((prev) =>
              prev.map((item, index) => {
                if (String(item.documentName || "").trim()) return item;
                return {
                  ...item,
                  documentName: String(nextRequired[index] || item.documentName || "").trim(),
                };
              })
            );
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
        >
          <option value="">General Upload (No scheme selected)</option>
          {schemes.map((scheme) => (
            <option key={scheme.scheme_name} value={scheme.scheme_name}>
              {scheme.scheme_name}
            </option>
          ))}
        </select>
      </label>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border border-dashed p-6 text-center transition ${
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50/70"
        }`}
      >
        <UploadCloud className="mx-auto h-8 w-8 text-blue-600" />
        <p className="mt-2 text-sm font-medium text-slate-700">
          Drag & drop one or more files here, or click below to choose.
        </p>
        <p className="mt-1 text-xs text-slate-500">Supported: PDF, PNG, JPG, JPEG (multiple)</p>
        <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Select Files
          <input type="file" multiple onChange={onFileChange} className="hidden" />
        </label>
        {entries.length > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Selected files ({entries.length})
            </p>
            <div className="mt-2 space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-700">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span className="truncate">{entry.file?.name || "Document"}</span>
                  </div>
                  <input
                    type="text"
                    value={entry.documentName}
                    onChange={(event) => onChangeDocumentName(entry.id, event.target.value)}
                    placeholder="Document name (e.g., Aadhaar Card)"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none ring-blue-500 focus:ring-2 sm:w-72"
                  />
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {requiredDocs.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Required for selected scheme
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {requiredDocs.map((doc) => (
              <button
                key={doc}
                type="button"
                onClick={() => assignRequiredDocName(doc)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-blue-200 hover:text-blue-700"
              >
                {doc}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {uploading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-600">
            Upload Progress: {uploadProgress}%{" "}
            {entries.length > 0 ? `(${Math.max(activeUploadIndex, 1)}/${entries.length})` : ""}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${Math.max(uploadProgress, 4)}%` }}
            />
          </div>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={uploading}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {uploading ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Uploading & Extracting...
          </>
        ) : (
          <>
            <CloudUpload className="h-4 w-4" />
            Upload & Extract All
          </>
        )}
      </button>
    </form>
  );
};

export default DocumentUploadPanel;
