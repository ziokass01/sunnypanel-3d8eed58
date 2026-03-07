import { getFunction } from "@/lib/functions";

export type FreeKeyType = {
  code: string;
  label: string;
  kind: "hour" | "day";
  value: number;
  duration_seconds: number;
  requires_double_gate?: boolean;
};

export type PublicLink = {
  label: string;
  url: string;
  icon?: string | null;
};

export type FreeConfig = {
  public_base_url: string | null;
  destination_gate_url: string;

  // Admin-controlled
  free_enabled: boolean;
  free_disabled_message: string;
  free_outbound_url: string | null;
  free_outbound_url_pass2?: string | null;
  free_link4m_rotate_days?: number;
  free_min_delay_seconds: number;
  free_min_delay_seconds_pass2?: number;
  free_return_seconds: number;
  free_daily_limit_per_fingerprint: number;
  free_require_link4m_referrer: boolean;

  // Public content (optional)
  free_public_note: string;
  free_public_links: PublicLink[];

  // Available options (only enabled key types are returned)
  key_types: FreeKeyType[];

  // Optional anti-bot
  turnstile_enabled: boolean;
  turnstile_site_key: string | null;

  missing: string[];
};

export async function fetchFreeConfig() {
  return getFunction<FreeConfig>("/free-config");
}
