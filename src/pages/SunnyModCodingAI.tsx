import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Code2,
  Crown,
  History,
  KeyRound,
  LogIn,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Upload,
  X,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { postFunction } from "@/lib/functions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const MODELS = [
  { id: "mimo-v2.5", label: "Chat thường", short: "Chat", desc: "Tiết kiệm, dùng hằng ngày", plan: "Basic", icon: MessageSquare },
  { id: "mimo-v2-pro", label: "Code tiết kiệm", short: "Code", desc: "Code ổn, ít tốn hơn Pro", plan: "Basic+", icon: Code2 },
  { id: "mimo-v2.5-pro", label: "Code Debug Pro", short: "Pro", desc: "Mạnh nhất cho code/debug", plan: "Pro", icon: Crown },
  { id: "mimo-v2-omni", label: "Omni", short: "Omni", desc: "Đa phương thức khi server hỗ trợ", plan: "Max", icon: Sparkles },
  { id: "mimo-v2.5-tts", label: "TTS", short: "TTS", desc: "Text to speech, mở theo gói", plan: "TTS", icon: Bot },
];

const SUGGESTIONS = [
  "Sửa lỗi build Android/NDK từ log này",
  "Phân tích lỗi Supabase Edge Function",
  "Viết migration SQL an toàn, không đụng module khác",
  "Tóm tắt thay đổi repo thành note kỹ thuật",
];

type Msg = { role: "user" | "assistant"; content: string };

function getDeviceId() {
  if (typeof window === "undefined") return "";
  const key = "sunny_ai_device_id";
  const old = localStorage.getItem(key);
  if (old) return old;
  const id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  localStorage.setItem(key, id);
  return id;
}

function buildChatTitle(messages: Msg[]) {
  const firstUser = messages.find((m) => m.role === "user")?.content?.trim();
  if (!firstUser) return "Đoạn chat mới";
  return firstUser.length > 42 ? `${firstUser.slice(0, 42)}…` : firstUser;
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function SunnyModCodingAIPage() {
  const { session, user, loading } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [model, setModel] = useState("mimo-v2.5");
  const [showTools, setShowTools] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Xin chào, tôi là SunnyMod Coding AI. Hãy gửi lỗi build, log Supabase, code hoặc câu hỏi debug của bạn.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const deviceId = useMemo(() => getDeviceId(), []);
  const token = session?.access_token ?? null;
  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];
  const SelectedIcon = selectedModel.icon;
  const hasStarted = messages.some((m) => m.role === "user");

  const conversations = useMemo(
    () => [
      { id: "current", title: buildChatTitle(messages), time: formatTime() },
      { id: "hint-1", title: "Debug build Android / AIDE", time: "Gợi ý" },
      { id: "hint-2", title: "Supabase function logs", time: "Gợi ý" },
      { id: "hint-3", title: "Viết note kỹ thuật repo", time: "Gợi ý" },
    ],
    [messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const newChat = () => {
    setMessages([
      {
        role: "assistant",
        content:
          "Đã mở đoạn chat mới. Gửi log/code/lỗi cần debug, tôi sẽ phân tích theo hướng an toàn, không đụng lan man.",
      },
    ]);
    setInput("");
    setShowTools(false);
    setShowModels(false);
    setSidebarOpen(false);
  };

  const redeem = async () => {
    if (!token) {
      toast({ title: "Cần đăng nhập", description: "Bạn cần đăng nhập tài khoản trước khi nhập key AI.", variant: "destructive" });
      return;
    }
    if (!redeemCode.trim()) return;
    try {
      const res = await postFunction<any>("/ai-sunny-redeem", { code: redeemCode, device_id: deviceId }, { authToken: token });
      if (!res?.ok) throw new Error(res?.msg ?? res?.code ?? "Redeem failed");
      toast({
        title: "Đã mở AI",
        description: `${res.plan_code} tới ${res.expires_at ? new Date(res.expires_at).toLocaleString("vi-VN") : "hôm nay"}`,
      });
      setRedeemCode("");
      setShowTools(false);
    } catch (e: any) {
      toast({ title: "Key không dùng được", description: e?.message ?? "Không thể nhập key.", variant: "destructive" });
    }
  };

  const send = async (forcedText?: string) => {
    const text = String(forcedText ?? input).trim();
    if (!text || sending) return;
    if (!token) {
      toast({ title: "Cần đăng nhập", description: "Tài khoản của bạn chưa đăng nhập nên chưa gọi được AI.", variant: "destructive" });
      return;
    }

    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setShowTools(false);
    setShowModels(false);

    try {
      const apiMessages = nextMessages.slice(-16).map((m) => ({ role: m.role, content: m.content }));
      const res = await postFunction<any>(
        "/ai-sunny-chat",
        {
          model,
          mode: model.includes("tts") ? "tts" : "chat",
          device_id: deviceId,
          messages: apiMessages,
        },
        { authToken: token },
      );
      if (!res?.ok) throw new Error(res?.msg ?? res?.code ?? "AI request failed");
      setMessages((prev) => [...prev, { role: "assistant", content: String(res.answer ?? "") }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Không gọi được AI: ${e?.message ?? e}` }]);
    } finally {
      setSending(false);
    }
  };

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={`${mobile ? "h-full w-[82vw] max-w-[340px]" : "hidden w-[300px] shrink-0 lg:flex"} flex-col border-r border-white/10 bg-[#101014] text-white`}>
      <div className="flex items-center gap-3 border-b border-white/10 p-4">
        <img src="/android-chrome-512x512.png" alt="SUNNY" className="h-9 w-9 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">SunnyMod AI</div>
          <div className="truncate text-xs text-zinc-400">Coding assistant</div>
        </div>
        {mobile && (
          <Button size="icon" variant="ghost" className="text-zinc-200 hover:bg-white/10" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="space-y-3 p-3">
        <Button onClick={newChat} className="h-11 w-full justify-start rounded-2xl bg-white text-black hover:bg-zinc-200">
          <Plus className="mr-2 h-4 w-4" /> Đoạn chat mới
        </Button>
        <button className="flex h-11 w-full items-center gap-2 rounded-2xl border border-white/10 px-3 text-left text-sm text-zinc-300 hover:bg-white/5">
          <History className="h-4 w-4" /> Lịch sử chat
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="mb-2 px-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Gần đây</div>
        <div className="space-y-1">
          {conversations.map((item) => (
            <button
              key={item.id}
              onClick={() => item.id === "current" && setSidebarOpen(false)}
              className={`w-full rounded-2xl px-3 py-3 text-left transition ${item.id === "current" ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              <div className="truncate text-sm text-zinc-100">{item.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{item.time}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="rounded-2xl bg-white/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-amber-300" /> {user?.email ? "Đã đăng nhập" : "Chưa đăng nhập"}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-500">{user?.email ?? "Cần đăng nhập để gọi AI"}</div>
          {!user && (
            <Button size="sm" className="mt-3 w-full rounded-xl" onClick={() => nav("/login")}>
              <LogIn className="mr-2 h-4 w-4" /> Đăng nhập
            </Button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0b0d] text-white">
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full"><Sidebar mobile /></div>
        </div>
      )}

      <div className="flex h-full">
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0b0b0d]/95 px-3 backdrop-blur sm:px-5">
            <Button size="icon" variant="ghost" className="text-zinc-200 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
            <Button size="icon" variant="ghost" className="hidden text-zinc-200 hover:bg-white/10 lg:inline-flex">
              <PanelLeftClose className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold sm:text-base">SunnyMod Coding AI</div>
              <div className="truncate text-xs text-zinc-500">Không dán API key, service role, secret vào chat</div>
            </div>

            <button
              onClick={() => setShowModels((v) => !v)}
              className="flex max-w-[180px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
            >
              <SelectedIcon className="h-4 w-4 text-amber-300" />
              <span className="truncate text-xs font-medium sm:text-sm">{selectedModel.short}: {model}</span>
            </button>

            {!loading && !user && (
              <Button size="sm" className="hidden rounded-2xl bg-white text-black hover:bg-zinc-200 sm:inline-flex" onClick={() => nav("/login")}>
                Đăng nhập
              </Button>
            )}
          </header>

          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {showModels && (
              <div className="absolute right-3 top-3 z-20 w-[min(92vw,380px)] rounded-3xl border border-white/10 bg-[#17171b] p-3 shadow-2xl">
                <div className="mb-2 px-2 text-sm font-semibold">Chọn model</div>
                <div className="space-y-2">
                  {MODELS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setModel(m.id); setShowModels(false); }}
                        className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left transition ${model === m.id ? "bg-amber-400 text-black" : "bg-white/5 hover:bg-white/10"}`}
                      >
                        <Icon className="mt-0.5 h-4 w-4" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{m.label}</span>
                          <span className={`block text-xs ${model === m.id ? "text-black/65" : "text-zinc-400"}`}>{m.id} · {m.desc}</span>
                        </span>
                        <Badge variant={model === m.id ? "secondary" : "outline"}>{m.plan}</Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-6">
              {!hasStarted ? (
                <div className="flex flex-1 flex-col items-center justify-center pb-28 text-center">
                  <div className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl">
                    <img src="/android-chrome-512x512.png" alt="SUNNY" className="h-16 w-16 rounded-2xl object-cover" />
                  </div>
                  <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl">Bạn muốn debug gì hôm nay?</h1>
                  <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
                    Chat AI hỗ trợ code, lỗi build, Supabase, Android/NDK và ghi note kỹ thuật theo flow SunnyMod.
                  </p>

                  {!loading && !user && (
                    <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                      Cần đăng nhập để gọi AI. Bạn vẫn có thể xem giao diện và chọn model.
                    </div>
                  )}

                  <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-sm text-zinc-200 hover:bg-white/10"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5 pb-36">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      {m.role === "assistant" && (
                        <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-black sm:flex">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}
                      <div
                        className={`max-w-[92%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-7 shadow-lg sm:max-w-[82%] ${
                          m.role === "user"
                            ? "bg-white text-black"
                            : "border border-white/10 bg-[#17171b] text-zinc-100"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex justify-start gap-3">
                      <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-black sm:flex">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-[#17171b] px-4 py-3 text-sm text-zinc-400">AI đang trả lời...</div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:left-[300px]">
            <div className="pointer-events-auto mx-auto max-w-4xl px-3 pb-4 sm:px-5">
              {showTools && (
                <div className="mb-2 overflow-hidden rounded-3xl border border-white/10 bg-[#17171b] p-3 shadow-2xl">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <button className="rounded-2xl bg-white/5 p-3 text-left hover:bg-white/10" onClick={() => setShowModels(true)}>
                      <Sparkles className="mb-2 h-4 w-4 text-amber-300" />
                      <div className="text-sm font-semibold">Chọn model/gói</div>
                      <div className="text-xs text-zinc-500">Basic, Pro, Omni, TTS</div>
                    </button>
                    <button className="rounded-2xl bg-white/5 p-3 text-left hover:bg-white/10">
                      <Upload className="mb-2 h-4 w-4 text-zinc-300" />
                      <div className="text-sm font-semibold">Upload log/file</div>
                      <div className="text-xs text-zinc-500">Sẽ mở ở bản sau</div>
                    </button>
                    <button className="rounded-2xl bg-white/5 p-3 text-left hover:bg-white/10">
                      <TerminalSquare className="mb-2 h-4 w-4 text-zinc-300" />
                      <div className="text-sm font-semibold">Sandbox/Terminal</div>
                      <div className="text-xs text-zinc-500">Chỉ gói Max khi admin bật</div>
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2 rounded-2xl bg-black/30 p-2">
                    <Input
                      className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
                      placeholder="Nhập key mở token/ngày"
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value)}
                    />
                    <Button className="rounded-xl bg-amber-300 text-black hover:bg-amber-200" onClick={redeem}>
                      <KeyRound className="mr-2 h-4 w-4" /> Mở
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-[2rem] border border-white/10 bg-[#17171b]/95 p-2 shadow-2xl backdrop-blur">
                <div className="flex items-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-12 w-12 shrink-0 rounded-2xl text-zinc-200 hover:bg-white/10 ${showTools ? "bg-white/10" : ""}`}
                    onClick={() => setShowTools((v) => !v)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Textarea
                    className="max-h-40 min-h-[52px] flex-1 resize-none border-0 bg-transparent px-2 py-3 text-base text-white placeholder:text-zinc-500 focus-visible:ring-0"
                    placeholder="Nhắn SunnyMod AI..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-12 w-12 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200"
                    onClick={() => send()}
                    disabled={sending || !input.trim()}
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-center text-[11px] text-zinc-600">
                SunnyMod AI có thể mắc lỗi. Kiểm tra code, log và không gửi secret/token thật.
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
