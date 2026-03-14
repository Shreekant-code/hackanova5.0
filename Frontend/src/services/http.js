import axios from "axios";
import { STORAGE_KEYS, readFromStorage } from "../utils/storage.js";

const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";

export const apiClient = axios.create({
  baseURL,
  timeout: 25000,
});

apiClient.interceptors.request.use(
  (config) => {
    const token = readFromStorage(STORAGE_KEYS.authToken, "");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status || 0;
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Request failed";
    return Promise.reject({
      status,
      message,
      details: error?.response?.data || null,
      originalError: error,
    });
  }
);
