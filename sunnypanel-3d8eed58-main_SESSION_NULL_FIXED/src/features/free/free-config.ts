import { getFunction } from "@/lib/functions";

export type FreeKeyType = {
  code: string;
  label: string;
  kind: "hour" | "day";
  value: number;
  duration_seconds: number;
  requires_double_gate?: boolean;
  app_code?: string | null;
  app_label?: string | null;
  key_signature?: string | null;
  allow_reset?: boolean;
  free_selection_mode?: "none" | "package" | "credit" | "mixed";
  free_selection_expand?: boolean;
  default_package_code?: string | null;
  default_credit_code?: string | null;
  default_wallet_kind?: string | null;
};


export type FindDumpsRewardConfig = {
  code: string;
  label: string;
  reward_mode: string;
  plan_code?: string | null;
  soft_credit_amount?: number;
  premium_credit_amount?: number;
  entitlement_days?: number;
  entitlement_seconds?: number;
  wallet_kind?: "normal" | "vip" | null;
};

export type PublicLink = {
  label: string;
  url: string;
  icon?: string | null;
};

export type FreeNoticeMode = "modal" | "inline";

export type FreeNoticeConfig = {
  enabled: boolean;
  title: string | null;
  content: string | null;
  mode: FreeNoticeMode;
  closable: boolean;
  showOnce: boolean;
};

export type FreeDownloadCard = {
  enabled: boolean;
  title: string | null;
  description: string | null;
  url: string | null;
  button_label: string | null;
  badge: string | null;
  icon_url: string | null;
};

export type FreeExternalDownload = {
  enabled: boolean;
  title: string | null;
  description: string | null;
  url: string | null;
  button_label: string | null;
  badge: string | null;
  icon_url: string | null;
};

export type FreeConfig = {
  public_base_url: string | null;
  destination_gate_url: string;

  free_enabled: boolean;
  free_disabled_message: string;
  free_outbound_url: string | null;
  free_outbound_url_pass2?: string | null;
  free_link4m_rotate_days?: number;
  free_session_waiting_limit?: number;
  free_link4m_rotate_nonce_pass1?: number;
  free_link4m_rotate_nonce_pass2?: number;
  free_min_delay_seconds: number;
  free_min_delay_seconds_pass2?: number;
  free_return_seconds: number;
  free_daily_limit_per_fingerprint: number;
  free_daily_limit_per_ip?: number;
  free_gate_require_ip_match?: boolean;
  free_gate_require_ua_match?: boolean;
  free_require_link4m_referrer: boolean;
  free_gate_antibypass_enabled?: boolean;
  free_gate_antibypass_seconds?: number;
  free_quota_timezone?: string;
  free_quota_day_key?: string;
  free_quota_remaining_today?: number | null;
  free_quota_by_app?: Record<string, {
    used_fingerprint: number;
    used_ip: number;
    remaining_fingerprint: number | null;
    remaining_ip: number | null;
    remaining_today: number | null;
    free_daily_limit_per_fingerprint: number;
    free_daily_limit_per_ip: number;
  }>;

  free_public_note: string;
  free_public_links: PublicLink[];
  free_download_enabled?: boolean;
  free_download_name?: string | null;
  free_download_info?: string | null;
  free_download_url?: string | null;
  free_download_size?: number | null;
  free_download_cards?: FreeDownloadCard[];
  free_notice?: FreeNoticeConfig;
  free_external_download?: FreeExternalDownload;

  key_types: FreeKeyType[];
  find_dumps_rewards?: Record<string, FindDumpsRewardConfig>;

  turnstile_enabled: boolean;
  turnstile_site_key: string | null;

  missing: string[];
};

export async function fetchFreeConfig(opts?: { fingerprint?: string | null; appCode?: string | null }) {
  const fp = String(opts?.fingerprint ?? "").trim();
  const appCode = String(opts?.appCode ?? "").trim();
  const headers: Record<string, string> = {};
  if (fp) headers["x-fp"] = fp;
  if (appCode) headers["x-app-code"] = appCode;
  return getFunction<FreeConfig>("/free-config", {
    headers: Object.keys(headers).length ? headers : undefined,
  });
}
