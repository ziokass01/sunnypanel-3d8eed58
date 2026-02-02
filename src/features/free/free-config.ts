import { getFunction } from "@/lib/functions";

export type FreeConfig = {
  public_base_url: string | null;
  destination_gate_url: string;
  free_outbound_url: string | null;
  show_test_redirect_button: boolean;
  turnstile_enabled: boolean;
  turnstile_site_key: string | null;
  missing: string[];
};

export async function fetchFreeConfig() {
  return getFunction<FreeConfig>("/free-config");
}
