import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SupportLink = {
  id: string;
  label: string;
  description: string;
  url: string;
  platform: "telegram" | "zalo" | "youtube" | "link";
  placement: "community" | "contact" | "other";
  enabled: boolean;
};
export type SupportConfig = {
  title: string;
  notice: string;
  community_title: string;
  community_description: string;
  bubble_enabled: boolean;
  banner_enabled: boolean;
  links: SupportLink[];
};
export const DEFAULT_SUPPORT: SupportConfig = {
  title: "Kết nối với SunnyMod",
  notice: "Tham gia nhóm để nhận thông báo và bản cập nhật mới nhất",
  community_title: "Cộng đồng SunnyMod",
  community_description:
    "Nhận bản cập nhật, hướng dẫn sử dụng và trao đổi cùng các thành viên.",
  bubble_enabled: true,
  banner_enabled: true,
  links: [
    {
      id: "admin",
      label: "Liên hệ Admin",
      description: "Hỗ trợ trực tiếp qua Zalo",
      url: "https://zalo.me/84373752504",
      platform: "zalo",
      placement: "contact",
      enabled: true,
    },
    {
      id: "group",
      label: "Tham gia nhóm Telegram",
      description: "Cập nhật mới nhất từ SunnyMod",
      url: "https://t.me/SunnyModCommunity",
      platform: "telegram",
      placement: "community",
      enabled: true,
    },
  ],
};
export function safeSupportUrl(value: string) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function validateSupport(value: unknown): SupportConfig {
  if (!value || typeof value !== "object")
    throw new Error("Cấu hình không hợp lệ");
  const c = value as SupportConfig;
  for (const k of [
    "title",
    "notice",
    "community_title",
    "community_description",
  ] as const) {
    if (typeof c[k] !== "string" || c[k].length > 500)
      throw new Error("Tiêu đề/mô tả tối đa 500 ký tự");
  }
  if (!c.title.trim() || !c.community_title.trim())
    throw new Error("Vui lòng nhập tiêu đề");
  if (
    typeof c.banner_enabled !== "boolean" ||
    typeof c.bubble_enabled !== "boolean" ||
    !Array.isArray(c.links) ||
    c.links.length > 20
  )
    throw new Error("Tối đa 20 mục hỗ trợ");
  const ids = new Set<string>();
  for (const l of c.links) {
    if (!l || typeof l.id !== "string" || !l.id || ids.has(l.id))
      throw new Error("Mã mục bị trùng hoặc thiếu");
    ids.add(l.id);
    if (
      typeof l.enabled !== "boolean" ||
      typeof l.label !== "string" ||
      !l.label.trim() ||
      l.label.length > 100 ||
      typeof l.description !== "string" ||
      l.description.length > 500 ||
      typeof l.url !== "string" ||
      l.url.length > 2048 ||
      !safeSupportUrl(l.url)
    )
      throw new Error("Mỗi mục cần tên và link HTTP/HTTPS hợp lệ");
    if (
      !["telegram", "zalo", "youtube", "link"].includes(l.platform) ||
      !["community", "contact", "other"].includes(l.placement)
    )
      throw new Error("Loại mục không hợp lệ");
  }
  return c;
}
export const supportDb = supabase as unknown as SupabaseClient;
export type SupportRecord = { config: SupportConfig; revision: number };
export async function loadSupport(): Promise<SupportRecord> {
  const { data, error } = await supportDb
    .from("sunny_support_settings")
    .select("config,revision")
    .eq("id", 1)
    .single();
  if (error)
    throw new Error(
      "Không tải được cấu hình hỗ trợ. Kiểm tra migration, quyền truy cập và kết nối.",
    );
  return { config: validateSupport(data.config), revision: data.revision };
}
export function useSupport() {
  const query = useQuery({
    queryKey: ["sunny-support"],
    queryFn: loadSupport,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return { ...query, config: query.data?.config ?? DEFAULT_SUPPORT };
}
