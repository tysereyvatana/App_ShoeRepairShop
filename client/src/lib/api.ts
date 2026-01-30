import axios from "axios";

function normalizeApiUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function resolveBaseUrl() {
  // ✅ IMPORTANT: must be direct access so Vite injects it at build time
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  const fromEnv = normalizeApiUrl(envUrl ?? "");
  if (fromEnv) return fromEnv;

  // If running on HTTPS (like Vercel) but env is missing, avoid mixed-content by using relative API.
  // (Optional: works great if you later add a Vercel rewrite for /api.)
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return "/api";
  }

  // Local dev fallback: backend on 4000
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
