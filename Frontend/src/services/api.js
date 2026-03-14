import { apiClient } from "./http.js";

const unwrap = async (requestPromise) => {
  const response = await requestPromise;
  return response.data;
};

export const authApi = {
  register: (payload) => unwrap(apiClient.post("/register", payload)),
  login: (payload) => unwrap(apiClient.post("/login", payload)),
};

export const profileApi = {
  createProfile: (payload) => unwrap(apiClient.post("/profile", payload)),
};

export const schemeApi = {
  getRecommendations: (profileSignature = "") =>
    unwrap(
      apiClient.get("/recommend-schemes", {
        params: profileSignature ? { profile_signature: profileSignature } : {},
      })
    ),
  searchSchemes: (payload) => unwrap(apiClient.post("/scheme/search-schemes", payload)),
};

export const documentApi = {
  getMyDocuments: () => unwrap(apiClient.get("/documents/my")),
  getRequiredStatus: (schemeData) =>
    unwrap(
      apiClient.post("/documents/required-status", {
        scheme_data: schemeData,
      })
    ),
  processFromCloudinary: (payload) => unwrap(apiClient.post("/documents/process", payload)),
  uploadAndProcessDocument: async (
    {
      file,
      documentName,
      schemeData,
      userProfile,
      fileType = "",
      extraFields = {},
    },
    { onUploadProgress } = {}
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_name", documentName);
    formData.append("scheme_data", JSON.stringify(schemeData || {}));
    formData.append("user_profile", JSON.stringify(userProfile || {}));
    if (fileType) formData.append("file_type", fileType);

    Object.entries(extraFields || {}).forEach(([key, value]) => {
      formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
    });

    return unwrap(
      apiClient.post("/documents/upload-and-process", formData, {
        onUploadProgress,
      })
    );
  },
};

export const automationApi = {
  previewPlan: (payload) => unwrap(apiClient.post("/apply-scheme", payload)),
  crawlPortal: (payload) => unwrap(apiClient.post("/automation/crawl", payload)),
  generateSteps: (payload) => unwrap(apiClient.post("/automation/generate-steps", payload)),
  executePlan: (payload) => unwrap(apiClient.post("/automation/execute", payload)),
  getSession: (sessionId) => unwrap(apiClient.get(`/automation/session/${sessionId}`)),
};
