const DEFAULT_APP_WORKSPACE_ORIGIN = "https://app.mityangho.id.vn";

function normalizeOrigin(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return DEFAULT_APP_WORKSPACE_ORIGIN;
  return raw.replace(/\/+$/, "");
}

export function getAppWorkspaceOrigin() {
  const envOrigin = (import.meta.env.VITE_APP_WORKSPACE_ORIGIN as string | undefined) ?? "";
  return normalizeOrigin(envOrigin);
}

export function buildAppWorkspaceUrl(
  appCode: string,
  section: "config" | "runtime" = "config",
  extraPath = "",
  search = "",
) {
  const origin = getAppWorkspaceOrigin();
  const safeApp = encodeURIComponent(String(appCode || "").trim());
  const safeSection = section === "runtime" ? "runtime" : "config";
  const suffix = extraPath ? `/${String(extraPath).replace(/^\/+/, "")}` : "";
  const safeSearch = search || "";
  return `${origin}/apps/${safeApp}/${safeSection}${suffix}${safeSearch}`;
}
