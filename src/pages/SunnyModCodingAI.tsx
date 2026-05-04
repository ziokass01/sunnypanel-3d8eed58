import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  CircleStop,
  Code2,
  Copy,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LogIn,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { postFunction } from "@/lib/functions";
import { useToast } from "@/hooks/use-toast";

const ADMIN_ZALO_URL = "https://zalo.me/84373752504";
const STORAGE_VERSION = "v6_hacker_shell";
const WELCOME_TEXT = "Xin chào, tôi là SunnyMod Coding AI. Hãy gửi lỗi build, log Supabase, code Android/NDK hoặc câu hỏi debug của bạn.";

const MODELS = [
  { id: "mimo-v2.5", label: "Chat thường", desc: "Tiết kiệm, dùng hằng ngày", tier: "free" },
  { id: "mimo-v2-pro", label: "Code tiết kiệm", desc: "Code ổn, ít tốn hơn Pro", tier: "basic" },
  { id: "mimo-v2.5-pro", label: "Code Debug Pro", desc: "Mạnh nhất cho code/debug", tier: "pro" },
  { id: "mimo-v2-omni", label: "Omni", desc: "Đa phương thức khi server hỗ trợ", tier: "max" },
  { id: "mimo-v2.5-tts", label: "TTS", desc: "Text-to-speech, mở theo gói", tier: "tts" },
] as const;

type Msg = { role: "user" | "assistant"; content: string; createdAt?: number };
type ChatThread = { id: string; title: string; updatedAt: number; createdAt: number; messages: Msg[] };
type LockedDialog = { title: string; description: string; action?: "contact" | "login" } | null;
type RedeemStatus = "idle" | "checking" | "success" | "error";

type ParsedBlock =
  | { type: "code"; lang: string; lines: string[] }
  | { type: "table"; lines: string[] }
  | { type: "list"; ordered: boolean; lines: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "text"; lines: string[] };

function nowId(prefix = "chat") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createThread(): ChatThread {
  const n = Date.now();
  return {
    id: nowId(),
    title: "Đoạn chat mới",
    createdAt: n,
    updatedAt: n,
    messages: [{ role: "assistant", content: WELCOME_TEXT, createdAt: n }],
  };
}

function safeJson<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getDeviceId() {
  if (typeof window === "undefined") return "";
  const key = "sunny_ai_device_id";
  const old = localStorage.getItem(key);
  if (old) return old;
  const id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  localStorage.setItem(key, id);
  return id;
}

function storageKey(userId?: string | null) {
  return `sunny_ai_threads:${STORAGE_VERSION}:${userId || "guest"}`;
}

function activeKey(userId?: string | null) {
  return `sunny_ai_active:${STORAGE_VERSION}:${userId || "guest"}`;
}

function draftKey(userId: string, threadId: string) {
  return `sunny_ai_draft:${STORAGE_VERSION}:${userId || "guest"}:${threadId || "new"}`;
}

function planKey(userId?: string | null) {
  return `sunny_ai_plan:${STORAGE_VERSION}:${userId || "guest"}`;
}

function shortEmail(email?: string | null) {
  const raw = String(email ?? "").trim();
  if (!raw) return "Khách";
  return raw.length > 30 ? `${raw.slice(0, 30)}…` : raw;
}

function normalizeTitle(text: string) {
  const one = String(text || "").replace(/[#*_`>\-|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!one) return "Đoạn chat mới";
  return one.length > 44 ? `${one.slice(0, 44)}…` : one;
}

function makeTitle(messages: Msg[]) {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim())?.content;
  const firstAny = messages.find((m) => m.content.trim())?.content;
  return normalizeTitle(firstUser || firstAny || "Đoạn chat mới");
}

function readThreads(userId?: string | null): ChatThread[] {
  if (typeof window === "undefined") return [];
  const arr = safeJson<ChatThread[]>(localStorage.getItem(storageKey(userId)), []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x?.id && Array.isArray(x.messages))
    .map((x) => ({
      ...x,
      title: x.title || makeTitle(x.messages),
      updatedAt: Number(x.updatedAt || x.createdAt || Date.now()),
      createdAt: Number(x.createdAt || x.updatedAt || Date.now()),
      messages: x.messages.filter((m) => m?.role && typeof m.content === "string"),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 60);
}

function saveThreads(userId: string | null | undefined, threads: ChatThread[], activeId: string) {
  if (typeof window === "undefined") return;
  try {
    const normalized = [...threads]
      .filter((t) => t.id && Array.isArray(t.messages))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 60);
    localStorage.setItem(storageKey(userId), JSON.stringify(normalized));
    localStorage.setItem(activeKey(userId), activeId);
  } catch {
    // keep UI alive even when localStorage is full/private
  }
}

function getHashThreadId() {
  if (typeof window === "undefined") return "";
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return "";
  const params = new URLSearchParams(h.includes("=") ? h : `t=${h}`);
  return params.get("t") || "";
}

function setHashThreadId(id: string) {
  if (typeof window === "undefined" || !id) return;
  const url = `${window.location.pathname}${window.location.search}#t=${encodeURIComponent(id)}`;
  window.history.replaceState(null, "", url);
}

function formatRelative(ms: number) {
  const diff = Math.max(0, Date.now() - Number(ms || Date.now()));
  if (diff < 60_000) return "vừa xong";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} phút trước`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} giờ trước`;
  return new Date(ms).toLocaleDateString("vi-VN");
}

function planAllowsModel(modelId: string, planCode: string, hasUser: boolean) {
  if (!hasUser) return false;
  const p = String(planCode || "free").toLowerCase();
  if (p.includes("max") || p.includes("admin") || p.includes("all")) return true;
  if (p.includes("tts")) return modelId === "mimo-v2.5-tts" || modelId === "mimo-v2.5";
  if (p.includes("pro")) return ["mimo-v2.5", "mimo-v2-pro", "mimo-v2.5-pro"].includes(modelId);
  if (p.includes("basic") || p.includes("trial") || p.includes("code")) return ["mimo-v2.5", "mimo-v2-pro"].includes(modelId);
  return modelId === "mimo-v2.5";
}

function getLoginRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  const { protocol, hostname, origin } = window.location;
  const host = hostname.toLowerCase();
  if (host === "mityangho.id.vn" || host === "www.mityangho.id.vn") return `${protocol}//app.mityangho.id.vn/coding-ai`;
  return `${origin}/coding-ai`;
}

function parseMarkdown(content: string): ParsedBlock[] {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w.+-]+)?\s*$/);
    if (fence) {
      const code: string[] = [];
      const lang = fence[1] || "";
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", lang, lines: code });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^\s*\|.+\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const table = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) table.push(lines[i++]);
      blocks.push({ type: "table", lines: table });
      continue;
    }

    if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered, lines: items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", lines: quote });
      continue;
    }

    const text: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*\|.+\|\s*$/.test(lines[i]) &&
      !/^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      text.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "text", lines: text });
  }

  return blocks;
}

function InlineText({ text }: { text: string }) {
  const parts = String(text || "").split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={index} className="rounded-md bg-black/50 px-1.5 py-0.5 font-mono text-[0.9em] text-amber-200">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="sunny-ai-md min-w-0 space-y-3 break-words text-[15px] leading-7 text-zinc-100">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          const code = block.lines.join("\n");
          return (
            <div key={index} className="overflow-hidden rounded-2xl border border-white/10 bg-black/45">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-zinc-500">
                <span>{block.lang || "code"}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(code)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-zinc-300 hover:bg-white/10"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>
              <pre className="max-w-full overflow-x-auto p-3 font-mono text-xs leading-5 text-zinc-100"><code>{code}</code></pre>
            </div>
          );
        }

        if (block.type === "table") {
          const headers = block.lines[0].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());
          const rows = block.lines.slice(2).map((r) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim()));
          return (
            <div key={index} className="max-w-full overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="bg-white/10 text-white">
                  <tr>{headers.map((h, hi) => <th key={hi} className="whitespace-nowrap px-3 py-2 font-semibold"><InlineText text={h} /></th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className="border-t border-white/10">
                      {row.map((cell, ci) => <td key={ci} className="px-3 py-2 align-top text-zinc-200"><InlineText text={cell} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index} className={`space-y-1 ${block.ordered ? "list-decimal" : "list-disc"} pl-5`}>
              {block.lines.map((item, ii) => <li key={ii}><InlineText text={item} /></li>)}
            </Tag>
          );
        }

        if (block.type === "quote") {
          return <blockquote key={index} className="rounded-2xl border-l-4 border-amber-400 bg-white/5 px-4 py-3 text-zinc-300">{block.lines.map((line, li) => <p key={li}><InlineText text={line} /></p>)}</blockquote>;
        }

        return (
          <div key={index} className="space-y-2">
            {block.lines.map((line, li) => {
              const h = line.match(/^(#{1,4})\s+(.+)$/);
              if (h) {
                const size = h[1].length <= 2 ? "text-lg" : "text-base";
                return <div key={li} className={`${size} mt-3 font-bold text-white`}><InlineText text={h[2]} /></div>;
              }
              if (/^---+$/.test(line.trim())) return <hr key={li} className="my-4 border-white/10" />;
              return <p key={li}><InlineText text={line} /></p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function sanitizeForChat(messages: Msg[]) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-18)
    .map((m) => ({ role: m.role, content: m.content }));
}

export function SunnyModCodingAIPage() {
  const { session, user } = useAuth();
  const { toast } = useToast();
  const token = session?.access_token ?? null;
  const userStorageId = user?.id || "guest";
  const deviceId = useMemo(() => getDeviceId(), []);

  const [model, setModel] = useState("mimo-v2.5");
  const [currentPlan, setCurrentPlan] = useState("Chưa mở gói");
  const [serverAllowedModels, setServerAllowedModels] = useState<string[]>([]);
  const [serverPlanInfo, setServerPlanInfo] = useState<any | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [loadedUserKey, setLoadedUserKey] = useState("");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<RedeemStatus>("idle");
  const [redeemMessage, setRedeemMessage] = useState("");
  const [lockedDialog, setLockedDialog] = useState<LockedDialog>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? threads[0] ?? createThread();
  const messages = activeThread.messages || [];
  const hasStartedChat = messages.some((m) => m.role === "user");
  const canUseSelectedModel = Boolean(user) && (
    serverAllowedModels.length > 0
      ? serverAllowedModels.includes(model)
      : planAllowsModel(model, currentPlan, Boolean(user))
  );

  useEffect(() => {
    const loaded = readThreads(userStorageId);
    const fallback = loaded.length ? loaded : [createThread()];
    const hashThread = getHashThreadId();
    const savedActive = typeof window !== "undefined" ? localStorage.getItem(activeKey(userStorageId)) : "";
    const active = fallback.find((t) => t.id === hashThread)?.id || fallback.find((t) => t.id === savedActive)?.id || fallback[0].id;
    setThreads(fallback);
    setActiveThreadId(active);
    setHashThreadId(active);
    setLoadedUserKey(userStorageId);

    if (typeof window !== "undefined") {
      const savedPlan = localStorage.getItem(planKey(userStorageId));
      if (savedPlan) setCurrentPlan(savedPlan);
      else setCurrentPlan(user ? "free" : "Chưa mở gói");
    }
  }, [userStorageId, user]);

  useEffect(() => {
    if (!loadedUserKey || loadedUserKey !== userStorageId || !activeThreadId || !threads.length) return;
    saveThreads(userStorageId, threads, activeThreadId);
    setHashThreadId(activeThreadId);
  }, [threads, activeThreadId, loadedUserKey, userStorageId]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeThreadId) return;
    setInput(localStorage.getItem(draftKey(userStorageId, activeThreadId)) || "");
  }, [activeThreadId, userStorageId]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeThreadId) return;
    localStorage.setItem(draftKey(userStorageId, activeThreadId), input);
  }, [input, activeThreadId, userStorageId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user && currentPlan === "Chưa mở gói") setCurrentPlan("free");
    if (!user && currentPlan !== "Chưa mở gói") setCurrentPlan("Chưa mở gói");
    localStorage.setItem(planKey(userStorageId), user ? currentPlan || "free" : "Chưa mở gói");
  }, [user, currentPlan, userStorageId]);


  // AI_CAPABILITY_SYNC_V1: pull current plan/access from server after login and
  // whenever tab returns to foreground. This fixes: admin set max/pro but UI still
  // thinks user is free and keeps locking Code Debug Pro/Sandbox.
  useEffect(() => {
    if (!token || !user) {
      setServerAllowedModels([]);
      setServerPlanInfo(null);
      return;
    }
    let cancelled = false;
    const syncProfile = async () => {
      try {
        const res = await postFunction<any>(
          "/ai-sunny-chat",
          { action: "profile", device_id: deviceId },
          { authToken: token },
        );
        if (cancelled || !res?.ok) return;
        const nextPlan = String(res.plan_code || "free").toLowerCase();
        const nextModels = Array.isArray(res.allowed_models) ? res.allowed_models.map(String).filter(Boolean) : [];
        setCurrentPlan(nextPlan);
        setServerAllowedModels(nextModels);
        setServerPlanInfo(res);
        if (typeof window !== "undefined") localStorage.setItem(planKey(userStorageId), nextPlan);
      } catch {
        // Keep local UI alive; actual send() will still be protected by server.
      }
    };
    syncProfile();
    const onFocus = () => syncProfile();
    const onVisible = () => { if (document.visibilityState === "visible") syncProfile(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, user?.id, userStorageId, deviceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending, activeThreadId]);

  useEffect(() => {
    const onHash = () => {
      const id = getHashThreadId();
      if (id && threads.some((t) => t.id === id)) setActiveThreadId(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [threads]);

  const updateThreadMessages = (threadId: string, nextMessages: Msg[]) => {
    const now = Date.now();
    setThreads((prev) => {
      const exists = prev.some((t) => t.id === threadId);
      const next = exists
        ? prev.map((t) => t.id === threadId ? { ...t, messages: nextMessages, title: makeTitle(nextMessages), updatedAt: now } : t)
        : [{ id: threadId, title: makeTitle(nextMessages), messages: nextMessages, createdAt: now, updatedAt: now }, ...prev];
      return next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 60);
    });
  };

  const openLocked = (title: string, description?: string, action: "contact" | "login" = "contact") => {
    setLockedDialog({
      title,
      action,
      description: description || "Chức năng này chưa được mở cho tài khoản/gói hiện tại. Hãy liên hệ admin để nâng gói hoặc cấp quyền.",
    });
  };

  const contactAdmin = () => window.open(ADMIN_ZALO_URL, "_blank", "noopener,noreferrer");

  const loginWithGoogle = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getLoginRedirectUrl(),
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Không mở được đăng nhập", description: e?.message ?? "Hãy thử lại hoặc liên hệ admin.", variant: "destructive" });
      setLoggingIn(false);
    }
  };

  const newChat = () => {
    const t = createThread();
    setThreads((prev) => [t, ...prev].slice(0, 60));
    setActiveThreadId(t.id);
    setInput("");
    setSidebarOpen(false);
    setPlusOpen(false);
    setModelOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openThread = (id: string) => {
    setActiveThreadId(id);
    setHashThreadId(id);
    setSidebarOpen(false);
    setPlusOpen(false);
    setModelOpen(false);
  };

  const deleteThread = (id: string) => {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (!next.length) {
        const fresh = createThread();
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (id === activeThreadId) setActiveThreadId(next[0].id);
      return next;
    });
  };

  const selectModel = (nextModel: string) => {
    if (!user) {
      openLocked("Cần đăng nhập", "Bạn cần đăng nhập Google trước, sau đó nhập key hoặc dùng gói do admin cấp để mở model.", "login");
      return;
    }
    const allowedByServer = serverAllowedModels.length > 0
      ? serverAllowedModels.includes(nextModel)
      : planAllowsModel(nextModel, currentPlan, Boolean(user));
    if (!allowedByServer) {
      const label = MODELS.find((m) => m.id === nextModel)?.label ?? nextModel;
      openLocked(`${label} đang bị khóa`, `Model ${nextModel} cần gói phù hợp. Bạn có thể nhập key mở token/gói hoặc liên hệ admin qua Zalo.`);
      return;
    }
    setModel(nextModel);
    setModelOpen(false);
    setPlusOpen(false);
  };

  const redeem = async () => {
    if (!token) {
      openLocked("Cần đăng nhập", "Bạn cần đăng nhập Google trước khi nhập key mở token/ngày hoặc gói AI.", "login");
      return;
    }
    const code = redeemCode.trim();
    if (!code || redeemStatus === "checking") return;
    setRedeemStatus("checking");
    setRedeemMessage("Đang kiểm tra key AI...");
    toast({ title: "Đang kiểm tra key", description: "Hệ thống đang xác nhận key AI." });
    try {
      const res = await postFunction<any>("/ai-sunny-redeem", { code, device_id: deviceId }, { authToken: token });
      if (!res?.ok) throw new Error(res?.msg ?? res?.code ?? "Redeem failed");
      const planCode = String(res.plan_code ?? "free");
      setCurrentPlan(planCode);
      setRedeemStatus("success");
      setRedeemMessage(`Đã mở gói ${planCode}. Lượt/ngày: ${res.daily_message_limit ?? "-"}, token/ngày: ${res.daily_token_limit ?? "-"}.`);
      setRedeemCode("");
      toast({ title: "Đã mở AI", description: `${planCode} tới ${res.expires_at ? new Date(res.expires_at).toLocaleString("vi-VN") : "hôm nay"}` });
    } catch (e: any) {
      setRedeemStatus("error");
      setRedeemMessage(e?.message ?? "Không thể nhập key.");
      toast({ title: "Key không dùng được", description: e?.message ?? "Không thể nhập key.", variant: "destructive" });
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!token) {
      openLocked("Cần đăng nhập", "Tài khoản của bạn chưa đăng nhập nên chưa gọi được AI. Hãy đăng nhập bằng Google rồi nhập key/gói do admin cấp.", "login");
      return;
    }
    if (!canUseSelectedModel) {
      openLocked("Model đang bị khóa", `Gói hiện tại (${currentPlan}) chưa mở ${selectedModel.label}. Hãy chọn Chat thường hoặc nhập key nâng gói.`);
      return;
    }

    const activeId = activeThread.id;
    const userMsg: Msg = { role: "user", content: text, createdAt: Date.now() };
    const nextMessages = [...messages, userMsg];
    updateThreadMessages(activeId, nextMessages);
    setInput("");
    setSending(true);
    setPlusOpen(false);
    setModelOpen(false);

    try {
      const res = await postFunction<any>(
        "/ai-sunny-chat",
        { model, mode: model.includes("tts") ? "tts" : "chat", device_id: deviceId, messages: sanitizeForChat(nextMessages) },
        { authToken: token },
      );
      if (!res?.ok) throw new Error(res?.msg ?? res?.code ?? "AI request failed");
      if (res.plan_code) setCurrentPlan(String(res.plan_code));
      const assistantMsg: Msg = { role: "assistant", content: String(res.answer ?? ""), createdAt: Date.now() };
      updateThreadMessages(activeId, [...nextMessages, assistantMsg]);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      updateThreadMessages(activeId, [...nextMessages, { role: "assistant", content: `Không gọi được AI: ${msg}`, createdAt: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const filteredThreads = threads
    .filter((t) => !search.trim() || t.title.toLowerCase().includes(search.trim().toLowerCase()) || t.messages.some((m) => m.content.toLowerCase().includes(search.trim().toLowerCase())))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const FeatureButton = ({ icon: Icon, label, desc, locked, onClick }: { icon: any; label: string; desc: string; locked?: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-zinc-100 transition hover:bg-white/10">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-zinc-100"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block font-medium">{label}</span><span className="block truncate text-xs text-zinc-500">{desc}</span></span>
      {locked ? <Lock className="h-4 w-4 text-amber-300" /> : null}
    </button>
  );

  return (
    <div className="min-h-svh overflow-hidden bg-[#0f0f10] text-zinc-50">
      {sidebarOpen ? <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[300px] flex-col border-r border-white/10 bg-[#0b0b0c] transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src="/android-chrome-512x512.png" alt="SUNNY" className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/15" />
            <div>
              <div className="font-semibold leading-none">SunnyMod AI</div>
              <div className="mt-1 text-[11px] text-zinc-500">Coding assistant</div>
            </div>
          </div>
          <button className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></button>
        </div>

        <div className="px-3">
          <button onClick={newChat} className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200">
            <Plus className="h-4 w-4" /> Đoạn chat mới
          </button>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-400">
            <Search className="h-4 w-4" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-zinc-600" placeholder="Tìm kiếm đoạn chat" />
          </div>
        </div>

        <div className="mt-5 flex-1 overflow-y-auto px-3">
          <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Gần đây</div>
          <div className="space-y-1">
            {filteredThreads.map((thread) => (
              <div key={thread.id} className={`group flex items-center gap-1 rounded-2xl ${thread.id === activeThreadId ? "bg-white/10" : "hover:bg-white/10"}`}>
                <button onClick={() => openThread(thread.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left text-sm text-zinc-100">
                  <MessageSquare className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{thread.title}</span>
                    <span className="block text-xs text-zinc-600">{formatRelative(thread.updatedAt)}</span>
                  </span>
                </button>
                <button onClick={() => deleteThread(thread.id)} className="mr-2 rounded-xl p-2 text-zinc-500 opacity-0 hover:bg-white/10 hover:text-red-300 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300" /> Gói đang có</div>
            <div className="mt-3 rounded-2xl bg-black/30 p-3">
              <div className="text-lg font-bold">{user ? currentPlan : "Chưa đăng nhập"}</div>
              <div className="mt-1 text-xs text-zinc-500">Model hiện tại: {selectedModel.id}</div>
            </div>
            <button onClick={() => { setRedeemOpen((v) => !v); setRedeemStatus("idle"); setRedeemMessage(""); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-3 py-2.5 text-sm font-bold text-black hover:bg-amber-300">
              <KeyRound className="h-4 w-4" /> Nhập key mở token
            </button>
            {redeemOpen ? (
              <div className="mt-3 space-y-2">
                <input
                  value={redeemCode}
                  onChange={(e) => { setRedeemCode(e.target.value); setRedeemStatus("idle"); setRedeemMessage(""); }}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white caret-white outline-none placeholder:text-zinc-600"
                  style={{ color: "#fff", WebkitTextFillColor: "#fff" }}
                  placeholder="AI-SUNNY-XXXXXX-XXXXXX-XXXXXX"
                />
                <button onClick={redeem} disabled={redeemStatus === "checking" || !redeemCode.trim()} className="w-full rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-50">
                  {redeemStatus === "checking" ? "Đang kiểm tra..." : "Xác nhận key"}
                </button>
                {redeemMessage ? <div className={`rounded-2xl border px-3 py-2 text-xs ${redeemStatus === "success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : redeemStatus === "error" ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-white/10 bg-white/5 text-zinc-300"}`}>{redeemMessage}</div> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-black">{user?.email?.[0]?.toUpperCase() || "S"}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{shortEmail(user?.email)}</div><div className="text-xs text-zinc-500">{user ? "Đã đăng nhập" : "Cần đăng nhập"}</div></div>
            {!user ? <button onClick={loginWithGoogle} disabled={loggingIn} className="rounded-xl p-2 hover:bg-white/10 disabled:opacity-60"><LogIn className="h-4 w-4" /></button> : null}
          </div>
        </div>
      </aside>

      <main className="flex min-h-svh flex-col lg:pl-[300px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-[#0f0f10]/85 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button className="rounded-xl p-2 text-zinc-300 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-2 lg:flex"><Bot className="h-5 w-5 text-amber-300" /><span className="font-semibold">SunnyMod Coding AI</span></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setModelOpen((v) => !v); setPlusOpen(false); }} className="relative flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-zinc-100 hover:bg-white/10">
              <Sparkles className="h-4 w-4 text-amber-300" /> {selectedModel.label}<ChevronDown className="h-4 w-4" />
            </button>
            <button onClick={() => openLocked("Cài đặt đang khóa", "Cài đặt nâng cao chỉ mở trong gói Max hoặc do admin cấp riêng.")} className="rounded-2xl border border-white/10 bg-white/[0.05] p-2 text-zinc-300 hover:bg-white/10"><Settings className="h-4 w-4" /></button>
          </div>
        </header>

        <section className="relative flex-1 overflow-y-auto px-4 pb-36 pt-8 sm:px-6">
          {!hasStartedChat ? (
            <div className="mx-auto flex min-h-[62svh] max-w-3xl flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black shadow-2xl shadow-black/30">
                <img src="/android-chrome-512x512.png" alt="SUNNY" className="h-10 w-10 rounded-xl object-cover" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Bạn muốn debug gì hôm nay?</h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-zinc-500">Gửi log build, lỗi Supabase, code Android/NDK hoặc mô tả bug. Lịch sử được lưu cục bộ và bấm lại được trong sidebar.</p>
              {!user ? <button onClick={loginWithGoogle} disabled={loggingIn} className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black hover:bg-zinc-200 disabled:opacity-60">{loggingIn ? "Đang mở Google..." : "Đăng nhập để dùng AI"}</button> : null}
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              {messages.map((msg, index) => (
                <div key={`${activeThread.id}-${index}`} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" ? <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black"><Bot className="h-4 w-4" /></div> : null}
                  <div className={`group relative max-w-[86%] rounded-3xl px-4 py-3 shadow-sm ${msg.role === "user" ? "bg-white text-black" : "border border-white/10 bg-white/[0.06] text-zinc-100"}`}>
                    {msg.role === "assistant" ? <MarkdownMessage content={msg.content} /> : <div className="whitespace-pre-wrap break-words text-sm leading-6">{msg.content}</div>}
                    <button type="button" onClick={() => navigator.clipboard?.writeText(msg.content)} className={`absolute -bottom-8 ${msg.role === "user" ? "right-2" : "left-2"} hidden items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs text-zinc-400 hover:text-white group-hover:flex`}><Copy className="h-3.5 w-3.5" /> Copy</button>
                  </div>
                </div>
              ))}
              {sending ? <div className="ml-11 flex w-fit items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-zinc-400"><RefreshCw className="h-4 w-4 animate-spin" /> AI đang trả lời...</div> : null}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-[#0f0f10]/90 px-3 py-3 backdrop-blur-xl lg:left-[300px]">
          <div className="relative mx-auto max-w-3xl">
            {plusOpen ? (
              <div className="absolute bottom-[76px] left-0 w-[310px] rounded-3xl border border-white/10 bg-[#171718] p-2 shadow-2xl shadow-black/60">
                <FeatureButton icon={Paperclip} label="Thêm tệp/log" desc="Khóa, chỉ mở khi admin bật" locked onClick={() => openLocked("Upload file đang khóa")} />
                <FeatureButton icon={ImageIcon} label="Thêm ảnh" desc="Dành cho Omni/Max" locked onClick={() => openLocked("Phân tích ảnh đang khóa", "Tính năng ảnh cần gói Omni/Max hoặc admin cấp riêng.")} />
                <FeatureButton icon={TerminalSquare} label="Sandbox / Terminal" desc="Gói Max, có giới hạn phiên" locked onClick={() => openLocked("Sandbox Terminal đang khóa", "Terminal chỉ mở cho gói cao nhất để tránh lạm dụng server.")} />
                <FeatureButton icon={FileText} label="Dán log dài" desc="Dùng chat hiện tại" onClick={() => { setPlusOpen(false); inputRef.current?.focus(); }} />
                <FeatureButton icon={Code2} label="Debug code" desc="Gửi code/build lỗi" onClick={() => { setPlusOpen(false); inputRef.current?.focus(); }} />
                <FeatureButton icon={KeyRound} label="Nhập key mở token" desc="Mở quota ngày hoặc gói tạm" onClick={() => { setRedeemOpen(true); setSidebarOpen(true); setPlusOpen(false); }} />
              </div>
            ) : null}

            {modelOpen ? (
              <div className="absolute bottom-[76px] right-0 w-[330px] rounded-3xl border border-white/10 bg-[#171718] p-2 shadow-2xl shadow-black/60">
                {MODELS.map((m) => {
                  const locked = !(serverAllowedModels.length > 0 ? serverAllowedModels.includes(m.id) : planAllowsModel(m.id, currentPlan, Boolean(user)));
                  return (
                    <button key={m.id} onClick={() => selectModel(m.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/10 ${model === m.id ? "bg-white/10" : ""}`}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Sparkles className="h-4 w-4 text-amber-300" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{m.label}</span><span className="block truncate text-xs text-zinc-500">{m.id} · {m.desc}</span></span>
                      {locked ? <Lock className="h-4 w-4 text-amber-300" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="flex items-end gap-2 rounded-[2rem] border border-white/10 bg-[#19191a] p-2 shadow-2xl shadow-black/30">
              <button onClick={() => { setPlusOpen((v) => !v); setModelOpen(false); }} className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-zinc-200 hover:bg-white/15"><Plus className="h-5 w-5" /></button>
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder="Hỏi SunnyMod AI hoặc dán log/code cần debug..."
                className="max-h-40 min-h-[52px] flex-1 resize-none bg-transparent px-2 py-3 text-base leading-6 text-white caret-white outline-none placeholder:text-zinc-600"
                style={{ color: "#fff", WebkitTextFillColor: "#fff" }}
              />
              <button onClick={() => sending ? setSending(false) : void send()} disabled={!input.trim() && !sending} className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 disabled:opacity-40">
                {sending ? <CircleStop className="h-5 w-5" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
            <div className="mt-2 text-center text-[11px] text-zinc-700">Không dán API key/service role vào chat. SunnyMod AI có thể mắc lỗi, hãy kiểm tra lại trước khi sửa production.</div>
          </div>
        </div>
      </main>

      {lockedDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={() => setLockedDialog(null)}>
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#1a1a1b] p-5 shadow-2xl shadow-black/70" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-black">
                {lockedDialog.action === "login" ? <UserRound className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold text-white">{lockedDialog.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{lockedDialog.description}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={() => setLockedDialog(null)} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5">Hủy</button>
              <button onClick={() => { const action = lockedDialog.action; setLockedDialog(null); if (action === "login") void loginWithGoogle(); else contactAdmin(); }} className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-black hover:bg-amber-300">
                {lockedDialog.action === "login" ? "Đăng nhập" : "Liên hệ admin"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
