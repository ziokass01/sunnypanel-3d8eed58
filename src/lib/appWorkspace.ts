const DEFAULT_ADMIN_ORIGIN = "https://admin.mityangho.id.vn";
const DEFAULT_APP_WORKSPACE_ORIGIN = "https://app.mityangho.id.vn";

function normalizeOrigin(value: string | undefined, fallback: string) {
  const raw = String(value ?? "").trim();
  return (raw || fallback).replace(/\/+$/, "");
}

function parseHosts(value: string | undefined, fallback: string[]) {
  const parsed = String(value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

export function getAdminOrigin() {
  return normalizeOrigin(import.meta.env.VITE_ADMIN_ORIGIN as string | undefined, DEFAULT_ADMIN_ORIGIN);
}

export function getAppWorkspaceOrigin() {
  return normalizeOrigin(import.meta.env.VITE_APP_WORKSPACE_ORIGIN as string | undefined, DEFAULT_APP_WORKSPACE_ORIGIN);
}

export function getAdminAppsUrl() {
  return `${getAdminOrigin()}/admin/apps`;
}

export function getAppWorkspaceUrl(appCode: string, tab: "config" | "runtime" = "config") {
  const safeAppCode = encodeURIComponent(String(appCode ?? "").trim());
  return `${getAppWorkspaceOrigin()}/apps/${safeAppCode}/${tab}`;
}

export function isAdminConsoleHost(hostname: string) {
  const host = String(hostname ?? "").trim().toLowerCase();
  const knownHosts = parseHosts(import.meta.env.VITE_ADMIN_HOSTS as string | undefined, ["admin.mityangho.id.vn"]);
  return knownHosts.includes(host) || host.startsWith("admin.");
}

export function isAppWorkspaceHost(hostname: string) {
  const host = String(hostname ?? "").trim().toLowerCase();
  const knownHosts = parseHosts(import.meta.env.VITE_APP_WORKSPACE_HOSTS as string | undefined, ["app.mityangho.id.vn"]);
  return knownHosts.includes(host);
}
