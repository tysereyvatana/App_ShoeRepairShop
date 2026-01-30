import axios from "axios";

function normalizeApiUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function resolveBaseUrl() {
  const envUrl = (import.meta as any)?.env?.VITE_API_URL as string | undefined;
  const fromEnv = normalizeApiUrl(envUrl ?? "");
  if (fromEnv) return fromEnv;

  // Default: same machine hostname, backend on 4000
  return `http://${window.location.hostname}:4000/api`;
}

export const api = axios.create({
  baseURL: resolveBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
