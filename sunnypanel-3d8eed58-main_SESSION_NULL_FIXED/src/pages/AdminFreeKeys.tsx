import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Filter, Trash2, Download, Plus, Image as ImageIcon } from "lucide-react";
import { getFunction, postFunction } from "@/lib/functions";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FIND_DUMPS_CREDITS, FIND_DUMPS_PACKAGES } from "@/lib/serverAppPolicies";

type SettingsRow = {
  id: number;
  free_outbound_url: string | null;
  free_outbound_url_pass2?: string | null;
  free_min_delay_seconds_pass2?: number;
  free_gate_antibypass_enabled?: boolean;
  free_gate_antibypass_seconds?: number;
  free_link4m_rotate_days?: number;
  free_session_waiting_limit?: number;
  free_link4m_rotate_nonce_pass1?: number;
  free_link4m_rotate_nonce_pass2?: number;
  free_enabled: boolean;
  free_disabled_message: string;
  free_min_delay_seconds: number;
  free_min_delay_enabled?: boolean;
  free_return_seconds: number;
  free_daily_limit_per_fingerprint: number;
  free_daily_limit_per_ip?: number;
  free_gate_require_ip_match?: boolean;
  free_gate_require_ua_match?: boolean;
  free_require_link4m_referrer: boolean;
  free_public_note: string;
  free_public_links: any;
  free_download_enabled?: boolean;
  free_download_name?: string | null;
  free_download_info?: string | null;
  free_download_path?: string | null;
  free_download_url?: string | null;
  free_download_size?: number | null;
  free_download_cards?: any;
  free_notice_enabled?: boolean;
  free_notice_title?: string | null;
  free_notice_content?: string | null;
  free_notice_mode?: "modal" | "inline" | null;
  free_notice_closable?: boolean;
  free_notice_show_once?: boolean;
  free_external_download_enabled?: boolean;
  free_external_download_title?: string | null;
  free_external_download_description?: string | null;
  free_external_download_url?: string | null;
  free_external_download_button_label?: string | null;
  free_external_download_badge?: string | null;
  free_external_download_icon_url?: string | null;
  updated_at: string;
  updated_by: string | null;
};

type KeyTypeRow = {
  code: string;
  label: string;
  kind: "hour" | "day";
  value: number;
  duration_seconds: number;
  sort_order: number;
  enabled: boolean;
  requires_double_gate?: boolean;
  app_code?: string | null;
  app_label?: string | null;
  key_signature?: string | null;
  allow_reset?: boolean;
  free_selection_mode?: "none" | "package" | "credit" | "mixed" | null;
  free_selection_expand?: boolean;
  default_package_code?: string | null;
  default_credit_code?: string | null;
  default_wallet_kind?: string | null;
  updated_at: string;
};

const APP_OPTIONS = [
  { code: "free-fire", label: "Free Fire", signature: "FF" },
  { code: "find-dumps", label: "Find Dumps", signature: "FD" },
] as const;

function getAppMeta(code?: string | null) {
  return APP_OPTIONS.find((item) => item.code === code) ?? APP_OPTIONS[0];
}

type SessionRow = {
  session_id: string;
  created_at: string;
  status: string;
  reveal_count: number;
  ip_hash: string;
  ua_hash: string;
  fingerprint_hash: string;
  last_error: string | null;
  started_at: string | null;
  gate_ok_at: string | null;
  revealed_at: string | null;
  key_type_code: string | null;
  duration_seconds: number | null;
  out_token_hash: string | null;
  claim_token_hash: string | null;
};

type GateLogRow = {
  id: number;
  created_at: string;
  session_id: string | null;
  key_type_code: string | null;
  pass_no: number | null;
  event_code: string;
  detail: any;
  ip_hash: string | null;
  fingerprint_hash: string | null;
  ua_hash: string | null;
};

type IssueRow = {
  issue_id: string;
  created_at: string;
  expires_at: string;
  license_id: string;
  key_mask: string;
  session_id: string;
  ip_hash: string;
  fingerprint_hash: string;
  ua_hash: string;
};

type PublicLink = {
  label: string;
  url: string;
  icon?: string | null;
};

type DownloadCardEditorItem = {
  id: string;
  enabled: boolean;
  title: string;
  description: string;
  url: string;
  button_label: string;
  icon_url: string;
};

type AdminTestResult = {
  ok: boolean;
  key?: string;
  expires_at?: string;
  ip_hash?: string | null;
  fp_hash?: string | null;
  session_id?: string | null;
  message?: string;
};

function nextDownloadCardId() {
  return `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEditorDownloadCard(value?: Partial<DownloadCardEditorItem> & Record<string, any>): DownloadCardEditorItem {
  return {
    id: String(value?.id ?? nextDownloadCardId()),
    enabled: Boolean(value?.enabled ?? true),
    title: String(value?.title ?? ""),
    description: String(value?.description ?? ""),
    url: String(value?.url ?? ""),
    button_label: String(value?.button_label ?? ""),
    icon_url: String(value?.icon_url ?? ""),
  };
}

function createEmptyDownloadCard(): DownloadCardEditorItem {
  return createEditorDownloadCard({
    enabled: true,
    title: "",
    description: "",
    url: "",
    button_label: "Mở liên kết",
    icon_url: "",
  });
}

function buildDownloadCardsFromSettings(settings?: Partial<SettingsRow> | null): DownloadCardEditorItem[] {
  const rawCards = Array.isArray((settings as any)?.free_download_cards) ? (settings as any)?.free_download_cards : [];
  const cards = rawCards
    .map((card: any) => createEditorDownloadCard(card))
    .filter((card: DownloadCardEditorItem) => card.title || card.description || card.url || card.button_label || card.icon_url);

  if (cards.length) return cards;

  const fallback: DownloadCardEditorItem[] = [];
  const primaryUrl = String((settings as any)?.free_download_url ?? "").trim();
  const externalUrl = String((settings as any)?.free_external_download_url ?? "").trim();

  if (primaryUrl || (settings as any)?.free_download_name || (settings as any)?.free_download_info) {
    fallback.push(createEditorDownloadCard({
      enabled: Boolean((settings as any)?.free_download_enabled ?? true),
      title: String((settings as any)?.free_download_name ?? ""),
      description: String((settings as any)?.free_download_info ?? ""),
      url: primaryUrl,
      button_label: "Mở liên kết",
      badge: "Link 1",
      icon_url: "",
    }));
  }

  if (externalUrl || (settings as any)?.free_external_download_title || (settings as any)?.free_external_download_description) {
    fallback.push(createEditorDownloadCard({
      enabled: Boolean((settings as any)?.free_external_download_enabled ?? true),
      title: String((settings as any)?.free_external_download_title ?? ""),
      description: String((settings as any)?.free_external_download_description ?? ""),
      url: externalUrl,
      button_label: String((settings as any)?.free_external_download_button_label ?? "Mở liên kết"),
      badge: String((settings as any)?.free_external_download_badge ?? "Link 2"),
      icon_url: String((settings as any)?.free_external_download_icon_url ?? ""),
    }));
  }

  return fallback.length ? fallback : [createEmptyDownloadCard()];
}

function getVietnamDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getVietnamDayRangeUtc(day: string) {
  const [year, month, date] = day.split("-").map((v) => Number(v));
  const utcOffsetMs = 7 * 60 * 60 * 1000;
  const startMs = Date.UTC(year, month - 1, date, 0, 0, 0, 0) - utcOffsetMs;
  const nextStartMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startUtcIso: new Date(startMs).toISOString(),
    nextStartUtcIso: new Date(nextStartMs).toISOString(),
  };
}

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatVnDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function shortText(v?: string | null, n = 10) {
  const x = String(v ?? "").trim();
  if (!x) return "-";
  return x.length > n ? `${x.slice(0, n)}…` : x;
}

function statusBadgeVariant(status?: string | null): "default" | "secondary" | "destructive" | "outline" {
  const v = String(status ?? "").toLowerCase();
  if (["revealed", "gate_ok", "pass1_ok", "reveal_ok", "ok"].includes(v)) return "default";
  if (["gate_fail", "closed", "blocked", "auto_blocked", "bad_referrer", "out_token_mismatch", "claim_invalid"].includes(v)) return "destructive";
  if (["started", "init", "pending"].includes(v)) return "secondary";
  return "outline";
}

function statusLabel(status?: string | null) {
  const v = String(status ?? "").trim();
  return v || "-";
}

function compactJson(value: any) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

function toLinksText(value: any): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((l) => {
      const label = String(l?.label ?? "").trim();
      const url = String(l?.url ?? "").trim();
      const icon = String(l?.icon ?? "").trim();
      if (!label || !url) return "";
      return `${label}|${url}${icon ? `|${icon}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");
}

function isFreeSchemaMissingError(message: string) {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("does not exist")
    || msg.includes("could not find the function")
    || msg.includes("check_free_ip_rate_limit")
    || msg.includes("check_free_fp_rate_limit")
    || msg.includes("licenses_free_")
    || msg.includes("relation")
  );
}

function parseLinksText(text: string): PublicLink[] {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: PublicLink[] = [];
  for (const line of lines) {
    const [labelRaw, urlRaw, iconRaw] = line.split("|");
    const label = (labelRaw ?? "").trim();
    const url = (urlRaw ?? "").trim();
    const icon = (iconRaw ?? "").trim();
    if (!label || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ label, url, icon: icon || null });
  }
  return out.slice(0, 8);
}

const NEW_FREE_SETTINGS_COLUMNS = [
  "free_daily_limit_per_ip",
  "free_gate_require_ip_match",
  "free_gate_require_ua_match",
  "free_notice_enabled",
  "free_notice_title",
  "free_notice_content",
  "free_notice_mode",
  "free_notice_closable",
  "free_notice_show_once",
  "free_external_download_enabled",
  "free_external_download_title",
  "free_external_download_description",
  "free_external_download_url",
  "free_external_download_button_label",
  "free_external_download_badge",
  "free_external_download_icon_url",
  "free_download_cards",
] as const;

function isMissingFreeSettingsColumnError(error: any) {
  const msg = String(error?.message || error?.details || error?.hint || "");
  return NEW_FREE_SETTINGS_COLUMNS.some((col) => msg.includes(col));
}

function omitNewFreeSettingsColumns<T extends Record<string, any>>(patch: T) {
  const legacyPatch = { ...patch } as Record<string, any>;
  for (const col of NEW_FREE_SETTINGS_COLUMNS) delete legacyPatch[col];
  return legacyPatch;
}

export function AdminFreeKeysPage() {
  const { toast } = useToast();

  const initialAppCode = useMemo(() => {
    if (typeof window === "undefined") return "free-fire";
    const raw = new URLSearchParams(window.location.search).get("app");
    return APP_OPTIONS.some((item) => item.code === raw) ? String(raw) : "free-fire";
  }, []);

  const baseUrl = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  const getKeyUrl = baseUrl ? `${baseUrl}/free` : "/free";
  const gateUrl = baseUrl ? `${baseUrl}/free/gate` : "/free/gate";
  const claimBaseUrl = baseUrl ? `${baseUrl}/free/claim` : "/free/claim";

  const openUrl = (u: string) => {
    if (!u) return;
    window.open(u, "_blank", "noopener");
  };

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast({ title: "Copied", description: "Đã copy vào clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Không thể copy. Hãy copy thủ công.", variant: "destructive" });
    }
  };

  const settingsQuery = useQuery({
    queryKey: ["free-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licenses_free_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as SettingsRow | null;
    },
  });

  const [outboundUrl, setOutboundUrl] = useState("");
  const [outboundUrlPass2, setOutboundUrlPass2] = useState("");
  const [rotateDays, setRotateDays] = useState(7);
  const [sessionWaitingLimit, setSessionWaitingLimit] = useState(2);
  const [rotateNoncePass1, setRotateNoncePass1] = useState(0);
  const [rotateNoncePass2, setRotateNoncePass2] = useState(0);

  const [freeEnabled, setFreeEnabled] = useState(true);
  const [disabledMessage, setDisabledMessage] = useState("Trang GetKey đang tạm đóng.");
  const [minDelayEnabled, setMinDelayEnabled] = useState(true);
  const [minDelay, setMinDelay] = useState(25);
  const [minDelayPass2, setMinDelayPass2] = useState(25);
  const [gateAntiBypassEnabled, setGateAntiBypassEnabled] = useState(false);
  const [gateAntiBypassSeconds, setGateAntiBypassSeconds] = useState(0);
  const [returnSeconds, setReturnSeconds] = useState(10);
  const [dailyLimit, setDailyLimit] = useState(1);
  const [dailyLimitPerIp, setDailyLimitPerIp] = useState(0);
  const [gateRequireIpMatch, setGateRequireIpMatch] = useState(true);
  const [gateRequireUaMatch, setGateRequireUaMatch] = useState(true);
  const [requireRef, setRequireRef] = useState(false);
  const [publicNote, setPublicNote] = useState("");
  const [publicLinksText, setPublicLinksText] = useState("");
  const [downloadPanelOpen, setDownloadPanelOpen] = useState(false);
  const [downloadCards, setDownloadCards] = useState<DownloadCardEditorItem[]>([createEmptyDownloadCard()]);
  const createKeyTypeRef = useRef<HTMLDivElement | null>(null);
  const adminTestRef = useRef<HTMLDivElement | null>(null);
  const [uploadingIconId, setUploadingIconId] = useState<string | null>(null);
  const [noticeEnabled, setNoticeEnabled] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [noticeMode, setNoticeMode] = useState<"modal" | "inline">("modal");
  const [noticeClosable, setNoticeClosable] = useState(true);
  const [noticeShowOnce, setNoticeShowOnce] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const focus = String(new URLSearchParams(window.location.search).get("focus") || "").trim().toLowerCase();
    if (!focus) return;
    const run = () => {
      const target = focus === "test" ? adminTestRef.current : createKeyTypeRef.current;
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const id = window.setTimeout(run, 250);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setOutboundUrl(s.free_outbound_url ?? "");
    setOutboundUrlPass2((s as any).free_outbound_url_pass2 ?? "");
    setRotateDays(Number((s as any).free_link4m_rotate_days ?? 7));
    setSessionWaitingLimit(Number((s as any).free_session_waiting_limit ?? 2));
    setRotateNoncePass1(Number((s as any).free_link4m_rotate_nonce_pass1 ?? 0));
    setRotateNoncePass2(Number((s as any).free_link4m_rotate_nonce_pass2 ?? 0));
    setFreeEnabled(Boolean(s.free_enabled));
    setDisabledMessage(s.free_disabled_message ?? "Trang GetKey đang tạm đóng.");
    setMinDelayEnabled(Boolean((s as any).free_min_delay_enabled ?? true));
    setMinDelay(Number(s.free_min_delay_seconds ?? 25));
    setMinDelayPass2(Number((s as any).free_min_delay_seconds_pass2 ?? s.free_min_delay_seconds ?? 25));
    setGateAntiBypassEnabled(Boolean((s as any).free_gate_antibypass_enabled ?? false));
    setGateAntiBypassSeconds(Math.max(0, Number((s as any).free_gate_antibypass_seconds ?? 0)));
    setReturnSeconds(Number(s.free_return_seconds ?? 10));
    setDailyLimit(Number(s.free_daily_limit_per_fingerprint ?? 1));
    setDailyLimitPerIp(Math.max(0, Number((s as any).free_daily_limit_per_ip ?? 0)));
    setGateRequireIpMatch(Boolean((s as any).free_gate_require_ip_match ?? true));
    setGateRequireUaMatch(Boolean((s as any).free_gate_require_ua_match ?? true));
    setRequireRef(Boolean(s.free_require_link4m_referrer));
    setPublicNote(String(s.free_public_note ?? ""));
    setPublicLinksText(toLinksText(s.free_public_links));
    setDownloadCards(buildDownloadCardsFromSettings(s));
    setNoticeEnabled(Boolean((s as any).free_notice_enabled ?? false));
    setNoticeTitle(String((s as any).free_notice_title ?? ""));
    setNoticeContent(String((s as any).free_notice_content ?? ""));
    setNoticeMode(String((s as any).free_notice_mode ?? "").trim().toLowerCase() === "inline" ? "inline" : "modal");
    setNoticeClosable(Boolean((s as any).free_notice_closable ?? true));
    setNoticeShowOnce(Boolean((s as any).free_notice_show_once ?? false));
  }, [settingsQuery.data]);

  const addDownloadCard = () => {
    setDownloadCards((prev) => [...prev, createEmptyDownloadCard()]);
    setDownloadPanelOpen(true);
  };

  const updateDownloadCard = (id: string, patch: Partial<DownloadCardEditorItem>) => {
    setDownloadCards((prev) => prev.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  };

  const removeDownloadCard = (id: string) => {
    setDownloadCards((prev) => {
      const next = prev.filter((card) => card.id !== id);
      return next.length ? next : [createEmptyDownloadCard()];
    });
  };

  const moveDownloadCard = (id: string, direction: -1 | 1) => {
    setDownloadCards((prev) => {
      const index = prev.findIndex((card) => card.id === id);
      if (index < 0) return prev;

      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;

      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const uploadCardIcon = async (id: string, file?: File | null) => {
    if (!file) return;
    setUploadingIconId(id);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
      const safeBase = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").slice(0, 40) || "icon";
      const path = `free-icons/${Date.now()}-${safeBase}.${ext || "png"}`;
      const storage = supabase.storage.from("free-downloads") as any;
      const { error: uploadErr } = await storage.upload(path, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type || "image/png",
      });
      if (uploadErr) throw uploadErr;
      const { data } = storage.getPublicUrl(path);
      const publicUrl = String(data?.publicUrl || "").trim();
      if (!publicUrl) throw new Error("ICON_URL_EMPTY");
      updateDownloadCard(id, { icon_url: publicUrl });
      toast({ title: "Đã upload icon", description: "Ảnh icon đã được gán vào box." });
    } catch (e: any) {
      toast({ title: "Upload icon failed", description: e?.message ?? "Không thể upload icon.", variant: "destructive" });
    } finally {
      setUploadingIconId(null);
    }
  };

  const saveSettings = useMutation({
    mutationFn: async () => {
      const normalizedDownloadCards = downloadCards
        .map((card) => ({
          enabled: Boolean(card.enabled),
          title: card.title.trim(),
          description: card.description.trim(),
          url: card.url.trim(),
          button_label: card.button_label.trim(),
          icon_url: card.icon_url.trim(),
        }))
        .filter((card) => card.title || card.description || card.url || card.button_label || card.icon_url);

      const legacyVisibleCards = normalizedDownloadCards.filter((card) => card.enabled && /^https?:\/\//i.test(card.url));
      const legacyPrimaryCard = legacyVisibleCards[0] ?? null;
      const legacySecondaryCard = legacyVisibleCards[1] ?? null;

      const patch = {
        free_outbound_url: outboundUrl.trim() || null,
        free_outbound_url_pass2: outboundUrlPass2.trim() || null,
        free_link4m_rotate_days: Math.max(1, Math.floor(Number(rotateDays) || 7)),
        free_session_waiting_limit: Math.max(1, Math.floor(Number(sessionWaitingLimit) || 2)),
        free_link4m_rotate_nonce_pass1: Math.max(0, Math.floor(Number(rotateNoncePass1) || 0)),
        free_link4m_rotate_nonce_pass2: Math.max(0, Math.floor(Number(rotateNoncePass2) || 0)),
        free_enabled: Boolean(freeEnabled),
        free_disabled_message: disabledMessage.trim() || "Trang GetKey đang tạm đóng.",
        free_min_delay_enabled: Boolean(minDelayEnabled),
        free_min_delay_seconds: minDelayEnabled ? Math.max(5, Math.floor(Number(minDelay) || 25)) : 0,
        free_min_delay_seconds_pass2: minDelayEnabled ? Math.max(5, Math.floor(Number(minDelayPass2) || 25)) : 0,
        free_gate_antibypass_enabled: Boolean(gateAntiBypassEnabled),
        free_gate_antibypass_seconds: gateAntiBypassEnabled ? Math.max(0, Math.floor(Number(gateAntiBypassSeconds) || 0)) : 0,
        free_return_seconds: Math.max(10, Math.floor(Number(returnSeconds) || 10)),
        free_daily_limit_per_fingerprint: Math.max(0, Math.floor(Number(dailyLimit) || 0)),
        free_daily_limit_per_ip: Math.max(0, Math.floor(Number(dailyLimitPerIp) || 0)),
        free_gate_require_ip_match: Boolean(gateRequireIpMatch),
        free_gate_require_ua_match: Boolean(gateRequireUaMatch),
        free_require_link4m_referrer: Boolean(requireRef),
        free_public_note: publicNote,
        free_public_links: parseLinksText(publicLinksText),
        free_download_enabled: Boolean(legacyPrimaryCard?.enabled && legacyPrimaryCard?.url),
        free_download_name: legacyPrimaryCard?.title || null,
        free_download_info: legacyPrimaryCard?.description || null,
        free_download_path: null,
        free_download_url: legacyPrimaryCard?.url || null,
        free_download_size: null,
        free_download_cards: normalizedDownloadCards,
        free_notice_enabled: Boolean(noticeEnabled && noticeContent.trim()),
        free_notice_title: noticeTitle.trim() || null,
        free_notice_content: noticeContent.trim() || null,
        free_notice_mode: noticeMode === "inline" ? "inline" : "modal",
        free_notice_closable: Boolean(noticeClosable),
        free_notice_show_once: Boolean(noticeShowOnce),
        free_external_download_enabled: Boolean(legacySecondaryCard?.enabled && legacySecondaryCard?.url),
        free_external_download_title: legacySecondaryCard?.title || null,
        free_external_download_description: legacySecondaryCard?.description || null,
        free_external_download_url: legacySecondaryCard?.url || null,
        free_external_download_button_label: legacySecondaryCard?.button_label || null,
        free_external_download_badge: null,
        free_external_download_icon_url: legacySecondaryCard?.icon_url || null,
      };

      const query: any = supabase.from("licenses_free_settings");
      const attempt = await query
        .upsert({ id: 1, ...patch }, { onConflict: "id" })
        .select("id")
        .single();

      if (!attempt.error) return attempt.data;
      if (!isMissingFreeSettingsColumnError(attempt.error)) throw attempt.error;

      const legacyPatch = omitNewFreeSettingsColumns(patch);

      const legacyAttempt = await supabase
        .from("licenses_free_settings")
        .upsert({ id: 1, ...legacyPatch }, { onConflict: "id" })
        .select("id")
        .single();

      if (legacyAttempt.error) throw legacyAttempt.error;
      return legacyAttempt.data;
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Free settings updated." });
      await settingsQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message ?? "Error", variant: "destructive" });
    },
  });

  const rotateNow = useMutation({
    mutationFn: async (passNo: 1 | 2) => {
      const field = passNo === 1 ? "free_link4m_rotate_nonce_pass1" : "free_link4m_rotate_nonce_pass2";
      const current = passNo === 1 ? rotateNoncePass1 : rotateNoncePass2;
      const { error } = await supabase
        .from("licenses_free_settings")
        .update({ [field]: current + 1 })
        .eq("id", 1);
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      toast({ title: "Rotated", description: "Đã đổi bucket ngay lập tức." });
      await settingsQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Rotate failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const keyTypesQuery = useQuery({
    queryKey: ["free-key-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licenses_free_key_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any as KeyTypeRow[];
    },
  });

  const toggleKeyType = useMutation({
    mutationFn: async (args: { code: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("licenses_free_key_types")
        .update({ enabled: args.enabled })
        .eq("code", args.code);
      if (error) throw error;
      return true;
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message ?? "Error", variant: "destructive" });
    },
    onSuccess: async () => {
      await keyTypesQuery.refetch();
    },
  });

  const toggleVipKeyType = useMutation({
    mutationFn: async (args: { code: string; requires_double_gate: boolean }) => {
      const { error } = await supabase
        .from("licenses_free_key_types")
        .update({ requires_double_gate: args.requires_double_gate })
        .eq("code", args.code);
      if (error) throw error;
      return true;
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message ?? "Error", variant: "destructive" });
    },
    onSuccess: async () => {
      await keyTypesQuery.refetch();
    },
  });

  const updateFindDumpsMeta = useMutation({
    mutationFn: async (args: { code: string; patch: Record<string, any> }) => {
      const { error } = await (supabase as any)
        .from("licenses_free_key_types")
        .update(args.patch)
        .eq("code", args.code);
      if (error) throw error;
      return true;
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message ?? "Error", variant: "destructive" });
    },
    onSuccess: async () => {
      await keyTypesQuery.refetch();
    },
  });

  const toggleAllowReset = useMutation({
    mutationFn: async (args: { code: string; allow_reset: boolean }) => {
      const { error } = await supabase
        .from("licenses_free_key_types")
        .update({ allow_reset: args.allow_reset })
        .eq("code", args.code);
      if (error) throw error;
      return true;
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message ?? "Error", variant: "destructive" });
    },
    onSuccess: async () => {
      await keyTypesQuery.refetch();
    },
  });

  const deleteKeyType = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("licenses_free_key_types").delete().eq("code", code);
      if (error) throw error;
      return true;
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e?.message ?? "Error", variant: "destructive" });
    },
    onSuccess: async () => {
      toast({ title: "Deleted", description: "Key type removed" });
      await keyTypesQuery.refetch();
    },
  });

  const disableAllKeyTypes = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("licenses_free_key_types")
        .update({ enabled: false })
        .eq("enabled", true);
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      toast({ title: "Updated", description: "All key types disabled." });
      await keyTypesQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message ?? "Error", variant: "destructive" });
    },
  });

  const [newKind, setNewKind] = useState<"hour" | "day">("hour");
  const [newValue, setNewValue] = useState<number>(1);
  const [newLabel, setNewLabel] = useState<string>("");
  const [newAppCode, setNewAppCode] = useState<string>(initialAppCode);
  const [newFindDumpsFlow, setNewFindDumpsFlow] = useState<"package" | "credit">("package");
  const [newFindDumpsRewardCode, setNewFindDumpsRewardCode] = useState<string>("classic");
  const [newFindDumpsExpand, setNewFindDumpsExpand] = useState<boolean>(false);
  const [newKeySignature, setNewKeySignature] = useState<string>(getAppMeta(initialAppCode).signature);
  const [newAllowReset, setNewAllowReset] = useState<boolean>(true);

  useEffect(() => {
    setNewKeySignature(getAppMeta(newAppCode).signature);
    if (newAppCode === "find-dumps") {
      setNewAllowReset(false);
    }
  }, [newAppCode]);

  useEffect(() => {
    if (newAppCode !== "find-dumps") return;
    setNewFindDumpsRewardCode(newFindDumpsFlow === "credit" ? "credit-normal" : "classic");
  }, [newAppCode, newFindDumpsFlow]);

  const createKeyType = useMutation({
    mutationFn: async () => {
      const appMeta = getAppMeta(newAppCode);
      const signature = (newKeySignature.trim().toUpperCase() || appMeta.signature).replace(/[^A-Z0-9]/g, "") || appMeta.signature;
      let value = 1;
      let code = "";
      let label = "";
      let duration_seconds = 86400;
      let sort_order = 0;
      let effectiveKind: "hour" | "day" = newKind;

      if (newAppCode === "find-dumps") {
        code = `${signature.toLowerCase()}_${newFindDumpsFlow}`;
        label = newLabel?.trim() || `${signature} | ${appMeta.label} | ${newFindDumpsFlow === "credit" ? "Credit" : "Gói"}`;
        duration_seconds = 86400;
        value = 1;
        effectiveKind = "day";
        sort_order = newFindDumpsFlow === "credit" ? 1100 : 1000;
      } else {
        const v = Math.max(1, Math.floor(Number(newValue) || 1));
        const max = newKind === "hour" ? 24 : 30;
        value = Math.min(max, v);
        const baseCode = `${newKind === "hour" ? "h" : "d"}${pad2(value)}`;
        code = `${signature.toLowerCase()}_${baseCode}`;
        label = newLabel?.trim() || `${signature} | ${appMeta.label} | ${value} ${newKind === "hour" ? "giờ" : "ngày"}`;
        duration_seconds = newKind === "hour" ? value * 3600 : value * 86400;
        effectiveKind = newKind;
        sort_order = newKind === "hour" ? value : 100 + value;
      }

      const { error } = await (supabase as any)
        .from("licenses_free_key_types")
        .upsert(
          {
            code,
            label,
            kind: effectiveKind,
            value,
            duration_seconds,
            sort_order,
            enabled: true,
            app_code: newAppCode,
            app_label: appMeta.label,
            key_signature: signature,
            allow_reset: newAppCode === "find-dumps" ? false : newAllowReset,
            free_selection_mode: newAppCode === "find-dumps" ? newFindDumpsFlow : "none",
            free_selection_expand: newAppCode === "find-dumps" ? Boolean(newFindDumpsExpand) : false,
            default_package_code: newAppCode === "find-dumps" && newFindDumpsFlow === "package" ? newFindDumpsRewardCode : null,
            default_credit_code: newAppCode === "find-dumps" && newFindDumpsFlow === "credit" ? newFindDumpsRewardCode : null,
            default_wallet_kind: newAppCode === "find-dumps" && newFindDumpsFlow === "credit" ? (newFindDumpsRewardCode === "credit-vip" ? "vip" : "normal") : null,
          },
          { onConflict: "code" },
        );
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      toast({ title: "Created", description: "Key type enabled." });
      setNewLabel("");
      setNewFindDumpsExpand(false);
      await keyTypesQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Create failed", description: e?.message ?? "Error", variant: "destructive" });
    },
  });

  const [testKeyTypeCode, setTestKeyTypeCode] = useState<string>("h01");
  const [testDryRun, setTestDryRun] = useState(false);
  const [adminTestResult, setAdminTestResult] = useState<AdminTestResult | null>(null);
  const [adminTestDebug, setAdminTestDebug] = useState<{ payload: any; response?: any; error?: string } | null>(null);

  const [pingResult, setPingResult] = useState<any>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [showMonitorFilters, setShowMonitorFilters] = useState(false);

  useEffect(() => {
    if (!keyTypesQuery.data?.length) return;
    if (keyTypesQuery.data.some((x) => x.code === testKeyTypeCode)) return;
    setTestKeyTypeCode(keyTypesQuery.data[0].code);
  }, [keyTypesQuery.data, testKeyTypeCode]);

  const adminTestGetKey = useMutation({
    mutationFn: async () => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) {
        const err = new Error("ADMIN_AUTH_REQUIRED") as Error & { code?: string };
        err.code = "ADMIN_AUTH_REQUIRED";
        throw err;
      }

      const payload = { key_type_code: testKeyTypeCode, dry_run: testDryRun };
      setAdminTestDebug({ payload });

      const data = await postFunction("/admin-free-test", payload, { authToken: token });
      setAdminTestDebug({ payload, response: data });
      return (data ?? { ok: false, message: "NO_RESPONSE" }) as AdminTestResult;
    },
    onSuccess: (data) => {
      setAdminTestResult(data);
      toast({ title: data.ok ? "Test success" : "Test failed", description: data.message || "Completed" });
      sessionsQuery.refetch();
      issuesQuery.refetch();
    },
    onError: (e: any) => {
      const code = String(e?.code ?? "").trim();
      const msg = String(e?.message ?? "Error");
      setAdminTestDebug((prev) => (prev ? { ...prev, error: msg } : { payload: null, error: msg }));

      if (code === "ADMIN_AUTH_REQUIRED" || msg === "ADMIN_AUTH_REQUIRED") {
        toast({
          title: "Test failed",
          description: "ADMIN_AUTH_REQUIRED: Bạn cần đăng nhập và có quyền admin để chạy test.",
          variant: "destructive",
        });
        return;
      }

      const isFetch = msg.toLowerCase().includes("failed to fetch");
      toast({
        title: "Test failed",
        description: isFetch
          ? `${msg}. Gợi ý: (1) CORS/OPTIONS bị chặn, (2) deploy sai tên function (/admin-free-test vs /free-admin-test), (3) backend URL/project mismatch.`
          : msg.includes("MISCONFIG")
            ? `${msg} (gợi ý: kiểm tra migration FREE_RATE_LIMIT đã apply)`
            : msg,
        variant: "destructive",
      });
    },
  });

  const [day, setDay] = useState(() => getVietnamDateKey());
  const [status, setStatus] = useState<string>("all");
  const [ipHash, setIpHash] = useState<string>("");

  const range = useMemo(() => getVietnamDayRangeUtc(day), [day]);

  const sessionsQuery = useQuery({
    queryKey: ["free-sessions", range.startUtcIso, range.nextStartUtcIso, status, ipHash],
    queryFn: async () => {
      let q = supabase
        .from("licenses_free_sessions")
        .select(
          "session_id,created_at,status,reveal_count,ip_hash,ua_hash,fingerprint_hash,last_error,started_at,gate_ok_at,revealed_at,key_type_code,duration_seconds,out_token_hash,claim_token_hash",
        )
        .gte("created_at", range.startUtcIso)
        .lt("created_at", range.nextStartUtcIso)
        .order("created_at", { ascending: false })
        .limit(200);

      if (status !== "all") q = q.eq("status", status);
      if (ipHash.trim()) q = q.eq("ip_hash", ipHash.trim());

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as SessionRow[];
    },
  });

  const issuesQuery = useQuery({
    queryKey: ["free-issues", range.startUtcIso, range.nextStartUtcIso, ipHash],
    queryFn: async () => {
      let q = supabase
        .from("licenses_free_issues")
        .select("issue_id,created_at,expires_at,license_id,key_mask,session_id,ip_hash,fingerprint_hash,ua_hash")
        .gte("created_at", range.startUtcIso)
        .lt("created_at", range.nextStartUtcIso)
        .order("created_at", { ascending: false })
        .limit(200);

      if (ipHash.trim()) q = q.eq("ip_hash", ipHash.trim());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as IssueRow[];
    },
  });

  const gateLogsQuery = useQuery({
    queryKey: ["free-gate-logs", range.startUtcIso, range.nextStartUtcIso, ipHash],
    queryFn: async () => {
      let q = supabase
        .from("licenses_free_gate_logs")
        .select("id,created_at,session_id,key_type_code,pass_no,event_code,detail,ip_hash,fingerprint_hash,ua_hash")
        .gte("created_at", range.startUtcIso)
        .lt("created_at", range.nextStartUtcIso)
        .order("created_at", { ascending: false })
        .limit(200);

      if (ipHash.trim()) q = q.eq("ip_hash", ipHash.trim());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as GateLogRow[];
    },
  });

  const freeSchemaHint = useMemo(() => {
    const errs = [
      settingsQuery.error,
      keyTypesQuery.error,
      sessionsQuery.error,
      issuesQuery.error,
      gateLogsQuery.error,
    ]
      .map((e: any) => String(e?.message ?? ""))
      .filter(Boolean);
    const hit = errs.find((m) => isFreeSchemaMissingError(m));
    return hit ?? null;
  }, [settingsQuery.error, keyTypesQuery.error, sessionsQuery.error, issuesQuery.error, gateLogsQuery.error]);

  const revokeLicense = useMutation({
    mutationFn: async (args: { issueId: string; licenseId: string }) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction(
        "/admin-free-delete-issued",
        { issue_id: args.issueId, license_id: args.licenseId, revoke: true, delete_issue: false, reason: "admin revoke" },
        { authToken: token },
      );
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Đã chặn key (is_active=false, expires_at=now)." });
      issuesQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Failed", description: e?.message ?? "Không thể chặn key.", variant: "destructive" });
    },
  });

  const blockIp = useMutation({
    mutationFn: async (args: { ipHash: string; reason: string }) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction("/admin-free-block", { ip_hash: args.ipHash, reason: args.reason || null }, { authToken: token });
    },
    onSuccess: () => {
      toast({ title: "Blocked", description: "IP hash đã được block vĩnh viễn." });
      sessionsQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Block failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const blockFp = useMutation({
    mutationFn: async (args: { fpHash: string; reason: string }) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction("/admin-free-block", { fingerprint_hash: args.fpHash, reason: args.reason || null }, { authToken: token });
    },
    onSuccess: () => {
      toast({ title: "Blocked", description: "Fingerprint hash đã được block vĩnh viễn." });
      sessionsQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Block failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction("/admin-free-delete-session", { session_id: sessionId }, { authToken: token });
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Session đã được xóa." });
      sessionsQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const deleteIssuedKey = useMutation({
    mutationFn: async (args: { issueId: string; licenseId: string; reason: string }) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction(
        "/admin-free-delete-issued",
        { issue_id: args.issueId, license_id: args.licenseId, revoke: true, delete_issue: true, reason: args.reason || "Deleted by admin" },
        { authToken: token },
      );
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Issued key record đã xóa và key đã revoke." });
      issuesQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const dashboardStats = useMemo(() => {
    const gateLogs = gateLogsQuery.data ?? [];
    const topError = gateLogs.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.event_code || "UNKNOWN");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topErrorLabel = Object.entries(topError).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
    return {
      sessionCount: 0,
      issueCount: 0,
      verifyFail: 0,
      activeBlocks: 0,
      pass1Hits: 0,
      pass2Hits: 0,
      topErrorLabel,
    };
  }, [gateLogsQuery.data]);

  const dashboardStatsQuery = useQuery({
    queryKey: ["free-dashboard-stats", range.startUtcIso, range.nextStartUtcIso, status, ipHash],
    queryFn: async () => {
      const baseSessions = () => {
        let query = supabase
          .from("licenses_free_sessions")
          .select("session_id", { count: "exact", head: true })
          .gte("created_at", range.startUtcIso)
          .lt("created_at", range.nextStartUtcIso);
        if (status !== "all") query = query.eq("status", status);
        if (ipHash.trim()) query = query.eq("ip_hash", ipHash.trim());
        return query;
      };

      const baseIssues = () => {
        let query = supabase
          .from("licenses_free_issues")
          .select("issue_id", { count: "exact", head: true })
          .gte("created_at", range.startUtcIso)
          .lt("created_at", range.nextStartUtcIso);
        if (ipHash.trim()) query = query.eq("ip_hash", ipHash.trim());
        return query;
      };

      const baseGateLogs = () => {
        let query = supabase
          .from("licenses_free_gate_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", range.startUtcIso)
          .lt("created_at", range.nextStartUtcIso);
        if (ipHash.trim()) query = query.eq("ip_hash", ipHash.trim());
        return query;
      };

      const [sessionsRes, issuesRes, verifyFailRes, activeBlocksRes, pass1Res, pass2Res] = await Promise.all([
        baseSessions(),
        baseIssues(),
        baseGateLogs().or("event_code.ilike.%FAIL%,event_code.ilike.%MISMATCH%,event_code.ilike.%EARLY%,event_code.ilike.%BLOCKED%,event_code.ilike.BAD_%"),
        baseGateLogs().eq("event_code", "AUTO_BLOCKED"),
        baseGateLogs().eq("pass_no", 1),
        baseGateLogs().eq("pass_no", 2),
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      if (issuesRes.error) throw issuesRes.error;
      if (verifyFailRes.error) throw verifyFailRes.error;
      if (activeBlocksRes.error) throw activeBlocksRes.error;
      if (pass1Res.error) throw pass1Res.error;
      if (pass2Res.error) throw pass2Res.error;

      return {
        sessionCount: sessionsRes.count ?? 0,
        issueCount: issuesRes.count ?? 0,
        verifyFail: verifyFailRes.count ?? 0,
        activeBlocks: activeBlocksRes.count ?? 0,
        pass1Hits: pass1Res.count ?? 0,
        pass2Hits: pass2Res.count ?? 0,
      };
    },
  });

  const dashboardStatsView = {
    ...dashboardStats,
    ...(dashboardStatsQuery.data ?? {}),
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-5">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Key free hôm nay</div><div className="mt-1 text-2xl font-semibold">{dashboardStatsView.issueCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Phiên gate</div><div className="mt-1 text-2xl font-semibold">{dashboardStatsView.sessionCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Verify fail</div><div className="mt-1 text-2xl font-semibold">{dashboardStatsView.verifyFail}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Auto blocked</div><div className="mt-1 text-2xl font-semibold">{dashboardStatsView.activeBlocks}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Lỗi nổi bật</div><div className="mt-1 text-sm font-semibold break-all">{dashboardStatsView.topErrorLabel}</div><div className="mt-1 text-xs text-muted-foreground">Pass1: {dashboardStatsView.pass1Hits} · Pass2: {dashboardStatsView.pass2Hits}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-xl">Free GetKey Settings</CardTitle>
              <CardDescription>
                Admin toàn quyền: mở/tắt trang GetKey, cấu hình Link4M, delay, auto-return, limit theo fingerprint. Phần trên cùng là dashboard nhanh để bạn nhìn tình hình trong ngày.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="soft" onClick={() => openUrl(getKeyUrl)}>
                Open GetKey
              </Button>
              <Button type="button" variant="outline" onClick={() => copyText(getKeyUrl)}>
                Copy GetKey URL
              </Button>
              <Button type="button" variant="outline" onClick={() => setDownloadPanelOpen((v) => !v)}>
                Download links
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {freeSchemaHint ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <div className="font-medium text-destructive">Thiếu cấu hình Free DB/RPC</div>
              <div className="mt-1 text-muted-foreground">
                Hãy apply các migration Free trong <span className="font-mono">supabase/migrations/*free*.sql</span>
                (đặc biệt RPC <span className="font-mono">check_free_ip_rate_limit</span>,
                <span className="font-mono">check_free_fp_rate_limit</span> và các bảng
                <span className="font-mono"> licenses_free_*</span>) rồi reload trang này.
              </div>
              <div className="mt-2 break-all font-mono text-xs">{freeSchemaHint}</div>
            </div>
          ) : null}

          <Collapsible open={downloadPanelOpen} onOpenChange={setDownloadPanelOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-between rounded-2xl">
                <span className="flex items-center gap-2"><Download className="h-4 w-4" /> Download links</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${downloadPanelOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="rounded-2xl border bg-background/60 p-4 space-y-4">
                <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Không upload file vào Supabase nữa. Phần này chỉ dùng link ngoài để tránh tốn bộ nhớ. Mỗi box là một link tải riêng, có thể thêm nhiều box.
                </div>

                <div className="space-y-4">
                  {downloadCards.map((card, index) => (
                    <div key={card.id} className="rounded-2xl border bg-muted/20 p-4 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">Box tải {index + 1}</div>
                          <div className="text-xs text-muted-foreground">Card tải xuống hiển thị ở trang free.</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Hiện</span>
                          <Switch checked={card.enabled} onCheckedChange={(v) => updateDownloadCard(card.id, { enabled: Boolean(v) })} />

                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => moveDownloadCard(card.id, -1)}
                            disabled={index === 0}
                            title="Đưa box lên trên"
                          >
                            <span className="text-sm leading-none">↑</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => moveDownloadCard(card.id, 1)}
                            disabled={index === downloadCards.length - 1}
                            title="Đưa box xuống dưới"
                          >
                            <span className="text-sm leading-none">↓</span>
                          </Button>

                          {downloadCards.length > 1 ? (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeDownloadCard(card.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Tên app / file</div>
                          <Input value={card.title} onChange={(e) => updateDownloadCard(card.id, { title: e.target.value })} placeholder="Ví dụ: SunnyMod V4" />
                        </div>


                        <div className="space-y-2 sm:col-span-2">
                          <div className="text-sm font-medium">Link tải</div>
                          <Input value={card.url} onChange={(e) => updateDownloadCard(card.id, { url: e.target.value })} placeholder="https://example.com/download" />
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">Nhãn nút</div>
                          <Input value={card.button_label} onChange={(e) => updateDownloadCard(card.id, { button_label: e.target.value })} placeholder="Mở liên kết" />
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">Ảnh / icon URL</div>
                          <Input value={card.icon_url} onChange={(e) => updateDownloadCard(card.id, { icon_url: e.target.value })} placeholder="https://example.com/icon.png" />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById(`icon-upload-${card.id}`)?.click()}
                              disabled={uploadingIconId === card.id}
                            >
                              <ImageIcon className="mr-2 h-4 w-4" />
                              {uploadingIconId === card.id ? "Đang upload..." : "Upload icon"}
                            </Button>
                            <input
                              id={`icon-upload-${card.id}`}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                void uploadCardIcon(card.id, file);
                                e.currentTarget.value = "";
                              }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <div className="text-sm font-medium">Mô tả</div>
                          <Textarea value={card.description} onChange={(e) => updateDownloadCard(card.id, { description: e.target.value })} rows={3} placeholder="Mô tả ngắn gọn cho box tải này..." />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" className="rounded-2xl" onClick={addDownloadCard}>
                  <Plus className="mr-2 h-4 w-4" /> Add box
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <div className="font-medium">Bật/tắt trang GetKey</div>
              <div className="text-xs text-muted-foreground">Tắt: người dùng không thể lấy key.</div>
            </div>
            <Switch checked={freeEnabled} onCheckedChange={setFreeEnabled} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Link4M outbound URL (https)</div>
              <Input
                value={outboundUrl}
                onChange={(e) => setOutboundUrl(e.target.value)}
                placeholder="https://link4m.co/st?api=YOUR_TOKEN&url=..."
                inputMode="url"
              />
              <div className="text-xs text-muted-foreground">
                Đây là link Link4M outbound. Hệ thống sẽ tự build URL dẫn về Gate bằng template:
                <div className="mt-1 font-mono text-xs">
                  • Dùng <span className="font-semibold">{`{GATE_URL}`}</span> (raw) hoặc <span className="font-semibold">{`{GATE_URL_ENC}`}</span> (encode)
                </div>
                <div className="mt-1 font-mono text-xs">Ví dụ: https://link4m.co/st?api=YOUR_TOKEN&url={"{GATE_URL_ENC}"}</div>
                <div className="mt-1">Với Link4M: bạn nên dùng placeholder. Riêng link Quick Link dạng <span className="font-mono">/st?api=...&amp;url=...</span> thì backend sẽ tự thay tham số <span className="font-mono">url=...</span> bằng Gate URL.</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Link4M outbound URL Pass2 (VIP)</div>
                <Input
                  value={outboundUrlPass2}
                  onChange={(e) => setOutboundUrlPass2(e.target.value)}
                  placeholder="https://link4m.co/st?api=YOUR_TOKEN_PASS2&url=..."
                  inputMode="url"
                />
                <div className="text-xs text-muted-foreground">
                  Nếu trống: hệ thống sẽ dùng lại outbound Pass1. Nên dùng placeholder <span className="font-mono">{"{GATE_URL_ENC}"}</span>.
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Rotate days (Link4M bucket)</div>
                <Input
                  type="number"
                  value={rotateDays}
                  onChange={(e) => setRotateDays(Number(e.target.value))}
                  min={1}
                />
                <div className="text-xs text-muted-foreground">
                  Trong cùng 1 bucket, Link4M Pass1/Pass2 sẽ giữ nguyên link cố định. Hết số ngày này hệ thống mới tự đổi link mới.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => rotateNow.mutate(1)} disabled={rotateNow.isPending}>Rotate pass1 now</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => rotateNow.mutate(2)} disabled={rotateNow.isPending}>Rotate pass2 now</Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Giới hạn session đang chờ / fingerprint</div>
                <Input type="number" value={sessionWaitingLimit} onChange={(e) => setSessionWaitingLimit(Number(e.target.value))} min={1} />
                <div className="text-xs text-muted-foreground">Nếu 1 thiết bị tạo quá nhiều phiên đang chờ trong 15 phút, hệ thống sẽ chặn tạo thêm.</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Thông báo khi tắt</div>
              <Textarea value={disabledMessage} onChange={(e) => setDisabledMessage(e.target.value)} rows={3} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium">Delay tối thiểu Pass1 (giây)</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">Bật</div>
                  <Switch checked={minDelayEnabled} onCheckedChange={setMinDelayEnabled} />
                </div>
              </div>
              <Input
                type="number"
                value={minDelay}
                onChange={(e) => setMinDelay(Number(e.target.value))}
                min={5}
                disabled={!minDelayEnabled}
              />
              <div className="text-xs text-muted-foreground">
                {minDelayEnabled
                  ? "Gate chỉ hợp lệ sau thời gian này (chống spam/bypass cơ bản)."
                  : "Đang tắt: không kiểm tra delay ở /free/gate."}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Delay tối thiểu Pass2 (giây)</div>
              <Input
                type="number"
                value={minDelayPass2}
                onChange={(e) => setMinDelayPass2(Number(e.target.value))}
                min={5}
                disabled={!minDelayEnabled}
              />
              <div className="text-xs text-muted-foreground">
                VIP 2-pass: Pass2 chỉ hợp lệ sau thời gian này.
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium">Time anti bypass Gate (giây)</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">Bật</div>
                  <Switch checked={gateAntiBypassEnabled} onCheckedChange={setGateAntiBypassEnabled} />
                </div>
              </div>
              <Input
                type="number"
                value={gateAntiBypassSeconds}
                onChange={(e) => setGateAntiBypassSeconds(Number(e.target.value))}
                min={0}
                disabled={!gateAntiBypassEnabled}
              />
              <div className="text-xs text-muted-foreground">
                {gateAntiBypassEnabled
                  ? "Nếu người dùng mở /free/gate quá sớm so với thời gian này, phiên sẽ bị hủy ngay."
                  : "Đang tắt: không kiểm tra mốc anti bypass riêng ở /free/gate."}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Tự quay lại /free (giây)</div>
              <Input
                type="number"
                value={returnSeconds}
                onChange={(e) => setReturnSeconds(Number(e.target.value))}
                min={10}
              />
              <div className="text-xs text-muted-foreground">Trang nhận key sẽ tự out về /free.</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Giới hạn / ngày VN (theo fingerprint)</div>
              <Input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                min={0}
              />
              <div className="text-xs text-muted-foreground">0 = tắt. Reset lúc 00:00 Asia/Ho_Chi_Minh.</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Giới hạn / ngày VN (theo IP)</div>
              <Input
                type="number"
                value={dailyLimitPerIp}
                onChange={(e) => setDailyLimitPerIp(Number(e.target.value))}
                min={0}
              />
              <div className="text-xs text-muted-foreground">0 = tắt (mặc định an toàn). Dùng để giảm spam khi cần.</div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">Ràng buộc thiết bị ở /free/gate (VIP 2-pass)</div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Bắt buộc khớp IP</span>
                <Switch checked={gateRequireIpMatch} onCheckedChange={setGateRequireIpMatch} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Bắt buộc khớp UA</span>
                <Switch checked={gateRequireUaMatch} onCheckedChange={setGateRequireUaMatch} />
              </div>
              <div className="text-xs text-muted-foreground">Mặc định đang bật để tương thích ngược.</div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <div className="font-medium">Yêu cầu referrer Link4M</div>
                <div className="text-xs text-muted-foreground">
                  Nếu bật: gate sẽ ưu tiên kiểm tra document.referrer có host chứa link4m.
                </div>
              </div>
              <Switch checked={requireRef} onCheckedChange={setRequireRef} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Ghi chú (hiện cho người dùng)</div>
              <Textarea
                value={publicNote}
                onChange={(e) => setPublicNote(e.target.value)}
                rows={4}
                placeholder="Ví dụ: cre, ghi chú, hướng dẫn..."
              />
              <div className="text-xs text-muted-foreground">Hiện trên /free và /free/claim (nếu có nội dung).</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Link cộng đồng (mỗi dòng)</div>
              <Textarea
                value={publicLinksText}
                onChange={(e) => setPublicLinksText(e.target.value)}
                rows={4}
                placeholder={`Zalo|https://zalo.me/your-group|zalo\nYouTube|https://youtube.com/@yourchannel|youtube`}
              />
              <div className="text-xs text-muted-foreground">
                Format: <span className="font-mono">label|url|icon</span> (icon optional: zalo/youtube/telegram).
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Thông báo quan trọng</div>
                <div className="text-xs text-muted-foreground">Hiển thị trên /free theo dạng popup hoặc banner, không ảnh hưởng flow hiện tại.</div>
              </div>
              <Switch checked={noticeEnabled} onCheckedChange={setNoticeEnabled} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <div className="text-sm font-medium">Tiêu đề</div>
                <Input value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} placeholder="Thông báo quan trọng" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="text-sm font-medium">Nội dung</div>
                <Textarea value={noticeContent} onChange={(e) => setNoticeContent(e.target.value)} rows={5} placeholder="Nhập nội dung nhiều dòng nếu cần..." />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Kiểu hiển thị</div>
                <Select value={noticeMode} onValueChange={(v) => setNoticeMode(v === "inline" ? "inline" : "modal")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modal">Modal popup</SelectItem>
                    <SelectItem value="inline">Inline banner/card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Cho phép đóng</span>
                  <Switch checked={noticeClosable} onCheckedChange={setNoticeClosable} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Chỉ hiển thị 1 lần mỗi trình duyệt</span>
                  <Switch checked={noticeShowOnce} onCheckedChange={setNoticeShowOnce} />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div>
              <div className="font-medium">Link gốc (để copy/open)</div>
              <div className="text-xs text-muted-foreground">Trang nhận key dùng claim token, link gốc là base.</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Trang chọn key</div>
              <div className="flex gap-2">
                <Input value={getKeyUrl} readOnly />
                <Button variant="secondary" onClick={() => copyText(getKeyUrl)}>
                  Copy
                </Button>
                <Button variant="outline" onClick={() => openUrl(getKeyUrl)}>
                  Open
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Gate callback</div>
              <div className="flex gap-2">
                <Input value={gateUrl} readOnly />
                <Button variant="secondary" onClick={() => copyText(gateUrl)}>
                  Copy
                </Button>
                <Button variant="outline" onClick={() => openUrl(gateUrl)}>
                  Open
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Trang nhận key (base)</div>
              <div className="flex gap-2">
                <Input value={claimBaseUrl} readOnly />
                <Button variant="secondary" onClick={() => copyText(claimBaseUrl)}>
                  Copy
                </Button>
                <Button variant="outline" onClick={() => openUrl(claimBaseUrl)}>
                  Open
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              Save settings
            </Button>
            <Button variant="secondary" onClick={() => settingsQuery.refetch()} disabled={settingsQuery.isFetching}>
              Reload
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Updated: {formatVnDateTime(settingsQuery.data?.updated_at ?? "")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
          <div>
            <CardTitle>Key types (giờ/ngày)</CardTitle>
            <CardDescription>Chỉ loại nào bật thì trang /free mới hiện lựa chọn.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => disableAllKeyTypes.mutate()}
              disabled={disableAllKeyTypes.isPending}
            >
              Disable all
            </Button>
            <Button variant="outline" onClick={() => keyTypesQuery.refetch()} disabled={keyTypesQuery.isFetching}>
              Reload
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-xs md:text-sm">
          <div ref={createKeyTypeRef} className="mb-4 rounded-md border p-3">
            <div className="font-medium">Tạo / bật loại key</div>
            <div className="text-xs text-muted-foreground">Chọn loại + thời gian rồi bấm Create. Nếu đã tồn tại, sẽ tự bật.</div>

            <div className="mt-3 grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <div className="text-sm font-medium">App</div>
                <Select value={newAppCode} onValueChange={setNewAppCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APP_OPTIONS.map((item) => (
                      <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newAppCode === "find-dumps" ? (
                <>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Nhánh key</div>
                    <Select value={newFindDumpsFlow} onValueChange={(v) => setNewFindDumpsFlow(v === "credit" ? "credit" : "package")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="package">Gói Find Dumps</SelectItem>
                        <SelectItem value="credit">Credit Find Dumps</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Mặc định khi user vượt</div>
                    <Select value={newFindDumpsRewardCode} onValueChange={setNewFindDumpsRewardCode}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(newFindDumpsFlow === "credit" ? FIND_DUMPS_CREDITS : FIND_DUMPS_PACKAGES).map((item) => (
                          <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Chữ ký key</div>
                    <Input
                      value={newKeySignature}
                      onChange={(e) => setNewKeySignature(e.target.value.toUpperCase())}
                      placeholder="FD"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <div className="text-sm font-medium">Tên hiển thị (optional)</div>
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder={newFindDumpsFlow === "credit" ? "Ví dụ: FD | Find Dumps | Credit" : "Ví dụ: FD | Find Dumps | Gói"}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Loại</div>
                    <Select value={newKind} onValueChange={(v) => setNewKind(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hour">Giờ (1..24)</SelectItem>
                        <SelectItem value="day">Ngày (1..30)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Số</div>
                    <Input
                      type="number"
                      value={newValue}
                      min={1}
                      max={newKind === "hour" ? 24 : 30}
                      onChange={(e) => setNewValue(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Chữ ký key</div>
                    <Input
                      value={newKeySignature}
                      onChange={(e) => setNewKeySignature(e.target.value.toUpperCase())}
                      placeholder="FF / FD"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Tên hiển thị (optional)</div>
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder={newKind === "hour" ? "Ví dụ: 6 giờ" : "Ví dụ: 3 ngày"}
                    />
                  </div>
                </>
              )}
            </div>

            {newAppCode === "find-dumps" ? (
              <div className="mt-3 flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">Cho user chọn thêm ở /free</div>
                  <div className="text-xs text-muted-foreground">Bật thì trang /free sẽ bung danh sách đúng nhánh này. Tắt thì user chỉ vượt key, phần thưởng lấy mặc định đã chốt ở đây.</div>
                </div>
                <Switch checked={newFindDumpsExpand} onCheckedChange={setNewFindDumpsExpand} />
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">Cho reset key</div>
                <div className="text-xs text-muted-foreground">Admin chọn trước loại key này có hỗ trợ reset hay không. Với Find Dumps, reset được chốt ở server key nên nhánh này tự tắt.</div>
              </div>
              <Switch checked={newAllowReset} onCheckedChange={setNewAllowReset} />
            </div>

            <div className="mt-3">
              <Button onClick={() => createKeyType.mutate()} disabled={createKeyType.isPending}>
                Create / Enable
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>On</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Signature</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Seconds</TableHead>
                  <TableHead>Reset</TableHead>
                  <TableHead>VIP 2-pass</TableHead>
                  <TableHead>Cấu hình /free</TableHead>
                  <TableHead>Mặc định</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(keyTypesQuery.data ?? []).map((k) => (
                  <TableRow key={k.code}>
                    <TableCell className="w-16">
                      <Switch
                        checked={k.enabled}
                        onCheckedChange={(v) => toggleKeyType.mutate({ code: k.code, enabled: Boolean(v) })}
                      />
                    </TableCell>
                    <TableCell>{k.app_label || getAppMeta(k.app_code).label}</TableCell>
                    <TableCell className="font-mono">{k.code}</TableCell>
                    <TableCell>{k.label}</TableCell>
                    <TableCell className="font-mono">{k.key_signature || getAppMeta(k.app_code).signature}</TableCell>
                    <TableCell>{k.kind}</TableCell>
                    <TableCell>{k.value}</TableCell>
                    <TableCell className="font-mono">{k.duration_seconds}</TableCell>
                    <TableCell className="w-24">
                      <Switch
                        checked={Boolean(k.allow_reset ?? true)}
                        onCheckedChange={(v) => toggleAllowReset.mutate({ code: k.code, allow_reset: Boolean(v) })}
                      />
                    </TableCell>
                    <TableCell className="w-24">
                      <Switch
                        checked={Boolean((k as any).requires_double_gate ?? false)}
                        onCheckedChange={(v) => toggleVipKeyType.mutate({ code: k.code, requires_double_gate: Boolean(v) })}
                      />
                    </TableCell>
                    <TableCell className="min-w-[220px] align-top">
                      {String(k.app_code || "") === "find-dumps" ? (
                        <div className="space-y-2">
                          <Select
                            value={String(k.free_selection_mode || "none")}
                            onValueChange={(value) => updateFindDumpsMeta.mutate({
                              code: k.code,
                              patch: {
                                free_selection_mode: value,
                                default_package_code: value === "package" ? (k.default_package_code || "classic") : null,
                                default_credit_code: value === "credit" ? (k.default_credit_code || "credit-normal") : null,
                                default_wallet_kind: value === "credit" ? (k.default_wallet_kind || ((k.default_credit_code || "") === "credit-vip" ? "vip" : "normal")) : null,
                              },
                            })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Khóa cứng</SelectItem>
                              <SelectItem value="package">Chỉ gói</SelectItem>
                              <SelectItem value="credit">Chỉ credit</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex items-center justify-between rounded-md border px-2 py-2">
                            <span className="text-xs text-muted-foreground">Bung chọn ở /free</span>
                            <Switch
                              checked={Boolean(k.free_selection_expand ?? false)}
                              onCheckedChange={(value) => updateFindDumpsMeta.mutate({ code: k.code, patch: { free_selection_expand: Boolean(value) } })}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Dùng flow thường</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[220px] align-top">
                      {String(k.app_code || "") === "find-dumps" ? (
                        <Select
                          value={String((k.free_selection_mode === "credit" ? (k.default_credit_code || "credit-normal") : (k.default_package_code || "classic")))}
                          onValueChange={(value) => updateFindDumpsMeta.mutate({
                            code: k.code,
                            patch: k.free_selection_mode === "credit"
                              ? { default_credit_code: value, default_wallet_kind: value === "credit-vip" ? "vip" : "normal" }
                              : { default_package_code: value },
                          })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(k.free_selection_mode === "credit" ? FIND_DUMPS_CREDITS : FIND_DUMPS_PACKAGES).map((item) => (
                              <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">Không áp dụng</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        onClick={() => {
                          const ok = window.confirm(`Delete key type ${k.code}? This cannot be undone.`);
                          if (ok) deleteKeyType.mutate(k.code);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!keyTypesQuery.data?.length ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-sm text-muted-foreground">
                      No rows
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Free keys monitor</CardTitle>
              <CardDescription>Log sessions + keys đã phát.</CardDescription>
            </div>
            <Collapsible open={showMonitorFilters} onOpenChange={setShowMonitorFilters}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Bộ lọc
                  <ChevronDown className={`h-4 w-4 transition-transform ${showMonitorFilters ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Ngày: {day}</Badge>
            <Badge variant="outline">Trạng thái: {statusLabel(status)}</Badge>
            <Badge variant="outline">IP: {ipHash.trim() ? shortText(ipHash, 14) : "tất cả"}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={status === "all" ? "default" : "outline"} onClick={() => setStatus("all")}>Tất cả</Button>
            <Button size="sm" variant={status === "started" ? "default" : "outline"} onClick={() => setStatus("started")}>Đang chờ gate</Button>
            <Button size="sm" variant={status === "gate_ok" ? "default" : "outline"} onClick={() => setStatus("gate_ok")}>Gate OK</Button>
            <Button size="sm" variant={status === "gate_fail" ? "default" : "outline"} onClick={() => setStatus("gate_fail")}>Gate fail</Button>
            <Button size="sm" variant={status === "revealed" ? "default" : "outline"} onClick={() => setStatus("revealed")}>Đã reveal</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Collapsible open={showMonitorFilters} onOpenChange={setShowMonitorFilters}>
            <CollapsibleContent className="rounded-xl border bg-muted/20 p-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Day (UTC)</div>
                  <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Status</div>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="started">started</SelectItem>
                      <SelectItem value="gate_ok">gate_ok</SelectItem>
                      <SelectItem value="gate_fail">gate_fail</SelectItem>
                      <SelectItem value="revealed">revealed</SelectItem>
                      <SelectItem value="closed">closed</SelectItem>
                      <SelectItem value="init">init (legacy)</SelectItem>
                      <SelectItem value="gate_returned">gate_returned (legacy)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">IP hash</div>
                  <Input value={ipHash} onChange={(e) => setIpHash(e.target.value)} placeholder="sha256(ip)" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <div ref={adminTestRef}><Card>
        <CardHeader>
          <CardTitle>🧪 Admin Test GetKey</CardTitle>
          <CardDescription>
            Chạy test server-side để kiểm tra flow phát key. Dùng thêm “Ping backend” để xem backend có phản hồi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setPingError(null);
                setPingResult(null);
                try {
                  const data = await getFunction("/free-config");
                  setPingResult(data);
                } catch (e: any) {
                  setPingError(String(e?.message ?? "PING_FAILED"));
                }
              }}
            >
              Ping backend (free-config)
            </Button>
          </div>

          {pingError ? <div className="text-sm text-destructive">{pingError}</div> : null}
          {pingResult ? (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div className="font-medium">Ping response</div>
              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(pingResult, null, 2)}</pre>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">Key type</div>
              <Select value={testKeyTypeCode} onValueChange={setTestKeyTypeCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(keyTypesQuery.data ?? []).map((k) => (
                    <SelectItem key={k.code} value={k.code}>
                      {k.code} - {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">Dry run (không phát key)</div>
              <Switch checked={testDryRun} onCheckedChange={setTestDryRun} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => adminTestGetKey.mutate()} disabled={adminTestGetKey.isPending || !testKeyTypeCode}>
                {adminTestGetKey.isPending ? "Testing..." : "Test"}
              </Button>
            </div>
          </div>

          {adminTestDebug ? (
            <div className="rounded-md border p-3 text-xs space-y-2">
              <div className="font-medium">Debug</div>
              <div>
                <div className="text-muted-foreground">Request payload</div>
                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(adminTestDebug.payload, null, 2)}</pre>
              </div>
              {adminTestDebug.response ? (
                <div>
                  <div className="text-muted-foreground">Response JSON</div>
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(adminTestDebug.response, null, 2)}</pre>
                </div>
              ) : null}
              {adminTestDebug.error ? (
                <div className="text-destructive">Error: {adminTestDebug.error}</div>
              ) : null}
            </div>
          ) : null}

          {adminTestResult ? (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div>Result: {adminTestResult.ok ? "OK" : "FAILED"}</div>
              <div>Message: {adminTestResult.message || "-"}</div>
              <div>Key: {adminTestResult.key || "-"}</div>
              <div>Expires: {formatVnDateTime(adminTestResult.expires_at)}</div>
              <div>IP hash: <span className="font-mono">{shortText(adminTestResult.ip_hash, 12)}</span></div>
              <div>FP hash: <span className="font-mono">{shortText(adminTestResult.fp_hash, 12)}</span></div>
              <div>Session: <span className="font-mono">{shortText(adminTestResult.session_id, 12)}</span></div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
          <div className="space-y-1">
            <CardTitle>Sessions</CardTitle>
            <CardDescription>{sessionsQuery.data?.length ?? 0} phiên gần nhất theo bộ lọc hiện tại.</CardDescription>
          </div>
          <Button variant="secondary" onClick={() => sessionsQuery.refetch()} disabled={sessionsQuery.isFetching}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-xs md:text-sm">
          <div className="grid gap-3 md:hidden">
            {(sessionsQuery.data ?? []).map((s) => (
              <div key={s.session_id} className="rounded-xl border bg-muted/20 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{formatVnDateTime(s.created_at)}</div>
                    <div className="font-mono text-sm">{s.key_type_code ?? "-"}</div>
                  </div>
                  <Badge variant={statusBadgeVariant(s.status)}>{statusLabel(s.status)}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Reveal: {s.reveal_count}</div>
                  <div>IP: <span className="font-mono">{shortText(s.ip_hash, 12)}</span></div>
                  <div>FP: <span className="font-mono">{shortText(s.fingerprint_hash, 12)}</span></div>
                  <div className="truncate">Error: {s.last_error ?? "-"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { const reason = window.prompt("Lý do block IP (optional):", "manual block") ?? ""; if (s.ip_hash) blockIp.mutate({ ipHash: s.ip_hash, reason }); }}>Block IP</Button>
                  <Button size="sm" variant="outline" onClick={() => { const reason = window.prompt("Lý do block FP (optional):", "manual block") ?? ""; if (s.fingerprint_hash) blockFp.mutate({ fpHash: s.fingerprint_hash, reason }); }}>Block FP</Button>
                  <Button size="sm" variant="destructive" onClick={() => { const ok = window.confirm("Delete session này?"); if (ok) deleteSession.mutate(s.session_id); }}>Delete</Button>
                </div>
              </div>
            ))}
            {!sessionsQuery.data?.length ? (
              <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No rows</div>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reveal</TableHead>
                  <TableHead>IP hash</TableHead>
                  <TableHead>FP hash</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sessionsQuery.data ?? []).map((s) => (
                  <TableRow key={s.session_id}>
                    <TableCell className="whitespace-nowrap">{formatVnDateTime(s.created_at)}</TableCell>
                    <TableCell><Badge variant={statusBadgeVariant(s.status)}>{statusLabel(s.status)}</Badge></TableCell>
                    <TableCell className="font-mono">
                      {s.key_type_code ?? "-"} {s.duration_seconds ? `(${s.duration_seconds}s)` : ""}
                    </TableCell>
                    <TableCell>{s.reveal_count}</TableCell>
                    <TableCell className="font-mono">{shortText(s.ip_hash, 12)}</TableCell>
                    <TableCell className="font-mono">{shortText(s.fingerprint_hash, 12)}</TableCell>
                    <TableCell className="text-xs">{s.last_error ?? ""}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const reason = window.prompt("Lý do block IP (optional):", "manual block") ?? "";
                            if (s.ip_hash) blockIp.mutate({ ipHash: s.ip_hash, reason });
                          }}
                        >
                          Block IP
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const reason = window.prompt("Lý do block FP (optional):", "manual block") ?? "";
                            if (s.fingerprint_hash) blockFp.mutate({ fpHash: s.fingerprint_hash, reason });
                          }}
                        >
                          Block FP
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            const ok = window.confirm("Delete session này?");
                            if (ok) deleteSession.mutate(s.session_id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!sessionsQuery.data?.length ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-sm text-muted-foreground">
                      No rows
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
          <div className="space-y-1">
            <CardTitle>Gate / Claim logs</CardTitle>
            <CardDescription>Log anti-bypass, lỗi xác thực, và auto-block 5 lần fail trong 10 phút.</CardDescription>
          </div>
          <Button variant="secondary" onClick={() => gateLogsQuery.refetch()} disabled={gateLogsQuery.isFetching}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-xs md:text-sm">
          <div className="grid gap-3 md:hidden">
            {(gateLogsQuery.data ?? []).map((row) => (
              <div key={row.id} className="rounded-xl border bg-muted/20 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{formatVnDateTime(row.created_at)}</div>
                    <div className="font-mono text-sm">{row.key_type_code ?? "-"}</div>
                  </div>
                  <Badge variant={statusBadgeVariant(row.event_code)}>{row.event_code}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Pass: {row.pass_no ?? "-"}</div>
                  <div>Session: <span className="font-mono">{shortText(row.session_id, 12)}</span></div>
                  <div>IP: <span className="font-mono">{shortText(row.ip_hash, 12)}</span></div>
                  <div>FP: <span className="font-mono">{shortText(row.fingerprint_hash, 12)}</span></div>
                </div>
                <pre className="rounded-lg bg-background/70 p-2 text-[11px] whitespace-pre-wrap break-words">{compactJson(row.detail)}</pre>
              </div>
            ))}
            {!gateLogsQuery.data?.length ? (
              <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No rows</div>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Pass</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>IP hash</TableHead>
                  <TableHead>FP hash</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(gateLogsQuery.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{formatVnDateTime(row.created_at)}</TableCell>
                    <TableCell><Badge variant={statusBadgeVariant(row.event_code)}>{row.event_code}</Badge></TableCell>
                    <TableCell className="font-mono">{row.key_type_code ?? "-"}</TableCell>
                    <TableCell>{row.pass_no ?? "-"}</TableCell>
                    <TableCell className="font-mono">{shortText(row.session_id, 12)}</TableCell>
                    <TableCell className="font-mono">{shortText(row.ip_hash, 12)}</TableCell>
                    <TableCell className="font-mono">{shortText(row.fingerprint_hash, 12)}</TableCell>
                    <TableCell className="text-xs">
                      <pre className="max-w-[26rem] whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2">{compactJson(row.detail)}</pre>
                    </TableCell>
                  </TableRow>
                ))}
                {!gateLogsQuery.data?.length ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-sm text-muted-foreground">
                      No rows
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
          <div className="space-y-1">
            <CardTitle>Issued keys</CardTitle>
            <CardDescription>{issuesQuery.data?.length ?? 0} key đã phát theo bộ lọc hiện tại.</CardDescription>
          </div>
          <Button variant="secondary" onClick={() => issuesQuery.refetch()} disabled={issuesQuery.isFetching}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>IP hash</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(issuesQuery.data ?? []).map((i) => (
                  <TableRow key={i.issue_id}>
                    <TableCell className="whitespace-nowrap">{formatVnDateTime(i.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatVnDateTime(i.expires_at)}</TableCell>
                    <TableCell className="font-mono">{i.key_mask}</TableCell>
                    <TableCell className="font-mono">{shortText(i.session_id, 12)}</TableCell>
                    <TableCell className="font-mono">{shortText(i.ip_hash, 12)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openUrl(`/licenses/${i.license_id}`)}>
                          Open
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={revokeLicense.isPending}
                          onClick={() => {
                            const ok = window.confirm("Chặn key này? (is_active=false + expires_at=now)");
                            if (ok) revokeLicense.mutate({ issueId: i.issue_id, licenseId: i.license_id });
                          }}
                        >
                          Revoke
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deleteIssuedKey.isPending}
                          onClick={() => {
                            const ok = window.confirm("Delete issued key record này? Key sẽ bị revoke trước khi xóa log.");
                            if (!ok) return;
                            const reason = window.prompt("Reason (optional):", "admin delete") ?? "";
                            deleteIssuedKey.mutate({ issueId: i.issue_id, licenseId: i.license_id, reason });
                          }}
                        >
                          Delete key
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!issuesQuery.data?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No rows
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
