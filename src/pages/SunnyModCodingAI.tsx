import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LogIn,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { postFunction } from "@/lib/functions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const MODELS = [
  { id: "mimo-v2.5", label: "Chat thường", desc: "Tiết kiệm, dùng hằng ngày", tier: "basic" },
  { id: "mimo-v2-pro", label: "Code tiết kiệm", desc: "Code ổn, ít tốn hơn Pro", tier: "basic" },
  { id: "mimo-v2.5-pro", label: "Code Debug Pro", desc: "Mạnh nhất cho code/debug", tier: "pro" },
  { id: "mimo-v2-omni", label: "Omni", desc: "Đa phương thức khi server hỗ trợ", tier: "max" },
  { id: "mimo-v2.5-tts", label: "TTS", desc: "Text to speech, mở theo gói", tier: "tts" },
] as const;

type Msg = { role: "user" | "assistant"; content: string };
type LockedDialog = { title: string; description: string; action?: "contact" | "login" } | null;

const ADMIN_ZALO_URL = "https://zalo.me/84373752504";

function getDeviceId() {
  if (typeof window === "undefined") return "";
  const key = "sunny_ai_device_id";
  const old = localStorage.getItem(key);
  if (old) return old;
  const id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  localStorage.setItem(key, id);
  return id;
}

function shortEmail(email?: string | null) {
  const raw = String(email ?? "").trim();
  if (!raw) return "Khách";
  return raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
}

function isAllowedByPlan(modelId: string, planCode: string, hasUser: boolean) {
  if (!hasUser) return false;
  const plan = planCode.toLowerCase();
  if (plan.includes("max") || plan.includes("admin")) return true;
  if (plan.includes("tts")) return modelId === "mimo-v2.5-tts" || modelId === "mimo-v2.5";
  if (plan.includes("pro")) return ["mimo-v2.5", "mimo-v2-pro", "mimo-v2.5-pro"].includes(modelId);
  if (plan.includes("basic")) return ["mimo-v2.5", "mimo-v2-pro"].includes(modelId);
  return modelId === "mimo-v2.5";
}

function getLoginRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  const { protocol, hostname, origin } = window.location;
  const host = hostname.toLowerCase();

  // Public domain does not host the normal control-panel login flow.
  // Send OAuth back to app-host /coding-ai so the AI page opens after login
  // instead of falling through to /apps.
  if (host === "mityangho.id.vn" || host === "www.mityangho.id.vn") {
    return `${protocol}//app.mityangho.id.vn/coding-ai`;
  }

  return `${origin}/coding-ai`;
}

export function SunnyModCodingAIPage() {
  const { session, user, loading } = useAuth();
  const { toast } = useToast();
  const [model, setModel] = useState("mimo-v2.5");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [currentPlan, setCurrentPlan] = useState("Chưa mở gói");
  const [lockedDialog, setLockedDialog] = useState<LockedDialog>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Xin chào, tôi là SunnyMod Coding AI. Hãy gửi lỗi build, log Supabase, code hoặc câu hỏi debug của bạn." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const deviceId = useMemo(() => getDeviceId(), []);
  const token = session?.access_token ?? null;
  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];
  const hasStartedChat = messages.length > 1;

  useEffect(() => {
    if (user && currentPlan === "Chưa mở gói") setCurrentPlan("free");
    if (!user && currentPlan !== "Chưa mở gói") setCurrentPlan("Chưa mở gói");
  }, [user, currentPlan]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const openLocked = (title: string, description?: string, action: "contact" | "login" = "contact") => {
    setLockedDialog({
      title,
      action,
      description: description || "Chức năng này chưa được mở cho tài khoản/gói hiện tại. Hãy liên hệ admin để nâng gói hoặc cấp quyền.",
    });
  };

  const contactAdmin = () => {
    if (typeof window !== "undefined") window.open(ADMIN_ZALO_URL, "_blank", "noopener,noreferrer");
  };

  const loginFromDialog = () => {
    setLockedDialog(null);
    void loginWithGoogle();
  };

  const loginWithGoogle = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      const redirectTo = getLoginRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
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
    setMessages([
      { role: "assistant", content: "Đã tạo đoạn chat mới. Gửi lỗi build, log hoặc code cần debug cho tôi." },
    ]);
    setInput("");
    setSidebarOpen(false);
  };

  const selectModel = (nextModel: string) => {
    if (!user) {
      openLocked(
        "Cần đăng nhập",
        "Bạn cần đăng nhập Google trước, sau đó nhập key hoặc dùng gói do admin cấp để mở model.",
        "login",
      );
      return;
    }

    if (!isAllowedByPlan(nextModel, currentPlan, Boolean(user))) {
      const meta = MODELS.find((m) => m.id === nextModel);
      openLocked(
        `${meta?.label ?? nextModel} đang bị khóa`,
        `Model ${nextModel} cần gói phù hợp. Bạn có thể nhập key mở token/gói hoặc liên hệ admin qua Zalo.`,
      );
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
    if (!redeemCode.trim()) return;
    try {
      const res = await postFunction<any>("/ai-sunny-redeem", { code: redeemCode, device_id: deviceId }, { authToken: token });
      if (!res?.ok) throw new Error(res?.msg ?? res?.code ?? "Redeem failed");
      const planCode = String(res.plan_code ?? "basic");
      setCurrentPlan(planCode);
      toast({ title: "Đã mở AI", description: `${planCode} tới ${res.expires_at ? new Date(res.expires_at).toLocaleString("vi-VN") : "hôm nay"}` });
      setRedeemCode("");
      setRedeemOpen(false);
    } catch (e: any) {
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

    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setPlusOpen(false);
    setModelOpen(false);

    try {
      const apiMessages = nextMessages.slice(-16).map((m) => ({ role: m.role, content: m.content }));
      const res = await postFunction<any>("/ai-sunny-chat", {
        model,
        mode: model.includes("tts") ? "tts" : "chat",
        device_id: deviceId,
        messages: apiMessages,
      }, { authToken: token });
      if (!res?.ok) throw new Error(res?.msg ?? res?.code ?? "AI request failed");
      if (res.plan_code) setCurrentPlan(String(res.plan_code));
      setMessages((prev) => [...prev, { role: "assistant", content: String(res.answer ?? "") }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Không gọi được AI: ${e?.message ?? e}` }]);
    } finally {
      setSending(false);
    }
  };

  const FeatureButton = ({ icon: Icon, label, desc, locked, onClick }: any) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-zinc-100 transition hover:bg-white/10"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-zinc-100"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block truncate text-xs text-zinc-500">{desc}</span>
      </span>
      {locked ? <Lock className="h-4 w-4 text-amber-300" /> : null}
    </button>
  );

  return (
    <div className="min-h-svh overflow-hidden bg-[#0f0f10] text-zinc-50">
      {sidebarOpen ? <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[286px] flex-col border-r border-white/10 bg-[#0b0b0c] transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src="/android-chrome-512x512.png" alt="SUNNY" className="h-9 w-9 rounded-xl object-cover" />
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
            <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-600" placeholder="Tìm kiếm đoạn chat" />
          </div>
        </div>

        <div className="mt-5 flex-1 overflow-y-auto px-3">
          <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Gần đây</div>
          <button className="flex w-full items-center gap-3 rounded-2xl bg-white/10 px-3 py-3 text-left text-sm text-zinc-100">
            <MessageSquare className="h-4 w-4 text-zinc-400" />
            <span className="line-clamp-1">Debug Android/Supabase</span>
          </button>
          <button className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-zinc-400 hover:bg-white/10">
            <MessageSquare className="h-4 w-4" />
            <span className="line-clamp-1">Phân tích log build</span>
          </button>

          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300" /> Gói đang có</div>
            <div className="mt-3 rounded-2xl bg-black/30 p-3">
              <div className="text-lg font-bold">{user ? currentPlan : "Chưa đăng nhập"}</div>
              <div className="mt-1 text-xs text-zinc-500">Model hiện tại: {selectedModel.id}</div>
            </div>
            <button onClick={() => setRedeemOpen((v) => !v)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-3 py-2.5 text-sm font-bold text-black hover:bg-amber-300">
              <KeyRound className="h-4 w-4" /> Nhập key mở token
            </button>
            {redeemOpen ? (
              <div className="mt-3 space-y-2">
                <input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white caret-white outline-none placeholder:text-zinc-600" style={{ color: "#fff", WebkitTextFillColor: "#fff" }} placeholder="AI-XXXXXX-XXXXXX" />
                <button onClick={redeem} className="w-full rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-black">Xác nhận key</button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-black">{user?.email?.[0]?.toUpperCase() || "S"}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{shortEmail(user?.email)}</div>
              <div className="text-xs text-zinc-500">{user ? "Đã đăng nhập" : "Cần đăng nhập"}</div>
            </div>
            {!user ? <button onClick={loginWithGoogle} disabled={loggingIn} className="rounded-xl p-2 hover:bg-white/10 disabled:opacity-60"><LogIn className="h-4 w-4" /></button> : null}
          </div>
        </div>
      </aside>

      <main className="flex min-h-svh flex-col lg:pl-[286px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-[#0f0f10]/85 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button className="rounded-xl p-2 text-zinc-300 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-2 lg:flex">
              <Bot className="h-5 w-5 text-amber-300" />
              <span className="font-semibold">SunnyMod Coding AI</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setModelOpen((v) => !v)} className="relative flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-zinc-100 hover:bg-white/10">
              <Sparkles className="h-4 w-4 text-amber-300" /> {selectedModel.label}
              <ChevronDown className="h-4 w-4" />
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
              <p className="mt-4 max-w-xl text-base leading-7 text-zinc-500">Gửi log build, lỗi Supabase, code Android/NDK hoặc mô tả bug. Các chức năng chưa mở sẽ hiện khóa và liên hệ admin.</p>
              {!user ? (
                <button onClick={loginWithGoogle} disabled={loggingIn} className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black hover:bg-zinc-200 disabled:opacity-60">
                  {loggingIn ? "Đang mở Google..." : "Đăng nhập để dùng AI"}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" ? <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black"><Bot className="h-4 w-4" /></div> : null}
                  <div className={`max-w-[86%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${m.role === "user" ? "bg-white text-black" : "border border-white/10 bg-white/[0.06] text-zinc-100"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {sending ? <div className="ml-11 w-fit rounded-3xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-zinc-400">AI đang trả lời...</div> : null}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-[#0f0f10]/90 px-3 py-3 backdrop-blur-xl lg:left-[286px]">
          <div className="relative mx-auto max-w-3xl">
            {plusOpen ? (
              <div className="absolute bottom-[76px] left-0 w-[310px] rounded-3xl border border-white/10 bg-[#171718] p-2 shadow-2xl shadow-black/60">
                <FeatureButton icon={Paperclip} label="Thêm tệp/log" desc="Khóa, chỉ mở khi admin bật" locked onClick={() => openLocked("Upload file đang khóa")} />
                <FeatureButton icon={ImageIcon} label="Thêm ảnh" desc="Dành cho Omni/Max" locked onClick={() => openLocked("Phân tích ảnh đang khóa", "Tính năng ảnh cần gói Omni/Max hoặc admin cấp riêng.")} />
                <FeatureButton icon={TerminalSquare} label="Sandbox / Terminal" desc="Gói Max, có giới hạn phiên" locked onClick={() => openLocked("Sandbox Terminal đang khóa", "Terminal chỉ mở cho gói cao nhất để tránh lạm dụng server.")} />
                <FeatureButton icon={KeyRound} label="Nhập key mở token" desc="Mở quota ngày hoặc gói tạm" onClick={() => { setRedeemOpen(true); setSidebarOpen(true); setPlusOpen(false); }} />
                <FeatureButton icon={Settings} label="Liên hệ admin" desc="Mở Zalo admin trực tiếp" onClick={contactAdmin} />
              </div>
            ) : null}

            {modelOpen ? (
              <div className="absolute bottom-[76px] right-0 w-[330px] rounded-3xl border border-white/10 bg-[#171718] p-2 shadow-2xl shadow-black/60">
                {MODELS.map((m) => {
                  const locked = !isAllowedByPlan(m.id, currentPlan, Boolean(user));
                  return (
                    <button key={m.id} onClick={() => selectModel(m.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/10 ${model === m.id ? "bg-white/10" : ""}`}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Sparkles className="h-4 w-4 text-amber-300" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{m.label}</span>
                        <span className="block truncate text-xs text-zinc-500">{m.id} · {m.desc}</span>
                      </span>
                      {locked ? <Lock className="h-4 w-4 text-amber-300" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="flex items-end gap-2 rounded-[2rem] border border-white/10 bg-[#19191a] p-2 shadow-2xl shadow-black/30">
              <button onClick={() => { setPlusOpen((v) => !v); setModelOpen(false); }} className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-zinc-200 transition hover:bg-white/15"><Plus className="h-5 w-5" /></button>
              <textarea
                className="max-h-40 min-h-[52px] flex-1 resize-none bg-transparent px-2 py-3 text-[15px] leading-6 text-white caret-white outline-none placeholder:text-zinc-600" style={{ color: "#fff", WebkitTextFillColor: "#fff", caretColor: "#fff" }}
                placeholder="Hỏi SunnyMod AI hoặc dán log/code cần debug..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button onClick={() => { setModelOpen((v) => !v); setPlusOpen(false); }} className="mb-1 hidden h-11 items-center gap-2 rounded-2xl bg-white/10 px-3 text-sm font-medium text-zinc-200 transition hover:bg-white/15 sm:flex">
                Model <ChevronDown className="h-4 w-4" />
              </button>
              <button onClick={send} disabled={sending || !input.trim()} className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200 disabled:opacity-40"><Send className="h-5 w-5" /></button>
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-600">Không dán API key/service role vào chat. SunnyMod AI có thể mắc lỗi, hãy kiểm tra lại trước khi sửa production.</p>
          </div>
        </div>
      </main>

      {lockedDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#171718] p-5 shadow-2xl shadow-black/60">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-black"><Lock className="h-5 w-5" /></div>
              <div>
                <h2 className="text-xl font-bold text-white">{lockedDialog.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{lockedDialog.description}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setLockedDialog(null)} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/10">Hủy</button>
              <button
                onClick={lockedDialog.action === "login" ? loginFromDialog : contactAdmin}
                disabled={lockedDialog.action === "login" && loggingIn}
                className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-60"
              >
                {lockedDialog.action === "login" ? (loggingIn ? "Đang mở..." : "Đăng nhập") : "Liên hệ admin"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
