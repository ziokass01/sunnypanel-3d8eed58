const DEFAULT_APP_WORKSPACE_ORIGIN = "https://app.mityangho.id.vn";
const DEFAULT_ADMIN_ORIGIN = "https://admin.mityangho.id.vn";

function normalizeOrigin(value?: string | null, fallback = DEFAULT_APP_WORKSPACE_ORIGIN) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ?? "";
    if (String(value).trim()) return String(value).trim();
  }
  return "";
}

export function getPublicSiteOrigin() {
  return normalizeOrigin(
    envValue("VITE_PUBLIC_BASE_URL", "VITE_PUBLIC_SITE_ORIGIN"),
    "https://mityangho.id.vn",
  );
}

export function getAdminOrigin() {
  return normalizeOrigin(
    envValue("VITE_ADMIN_ORIGIN"),
    DEFAULT_ADMIN_ORIGIN,
  );
}

export function getAdminAppsUrl() {
  return `${getAdminOrigin()}/admin/apps`;
}

export function getAppWorkspaceOrigin() {
  return normalizeOrigin(
    envValue("VITE_APP_BASE_URL", "VITE_APP_WORKSPACE_ORIGIN"),
    DEFAULT_APP_WORKSPACE_ORIGIN,
  );
}

export function buildAppWorkspaceUrl(
  appCode: string,
  section: "config" | "runtime" = "runtime",
  extraPath = "",
  search = "",
) {
  const origin = getAppWorkspaceOrigin();
  const safeApp = encodeURIComponent(String(appCode || "").trim());
  const safeSection = section === "config" ? "config" : "runtime";
  const suffix = extraPath ? `/${String(extraPath).replace(/^\/+/, "")}` : "";
  const safeSearch = search || "";
  return `${origin}/apps/${safeApp}/${safeSection}${suffix}${safeSearch}`;
}
