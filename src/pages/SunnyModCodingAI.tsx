import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, KeyRound, Plus, Send, Sparkles } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { postFunction } from "@/lib/functions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const MODELS = [
  { id: "mimo-v2.5", label: "Chat thường", desc: "Tiết kiệm, dùng hằng ngày" },
  { id: "mimo-v2-pro", label: "Code tiết kiệm", desc: "Code ổn, ít tốn hơn Pro" },
  { id: "mimo-v2.5-pro", label: "Code Debug Pro", desc: "Mạnh nhất cho code/debug" },
  { id: "mimo-v2-omni", label: "Omni", desc: "Đa phương thức khi server hỗ trợ" },
  { id: "mimo-v2.5-tts", label: "TTS", desc: "Text to speech, mở theo gói" },
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

export function SunnyModCodingAIPage() {
  const { session, user, loading } = useAuth();
  const { toast } = useToast();
  const [model, setModel] = useState("mimo-v2.5");
  const [showPlus, setShowPlus] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Xin chào, tôi là SunnyMod Coding AI. Hãy gửi lỗi build, log Supabase, code hoặc câu hỏi debug của bạn." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const deviceId = useMemo(() => getDeviceId(), []);
  const token = session?.access_token ?? null;
  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const redeem = async () => {
    if (!token) {
      toast({ title: "Cần đăng nhập", description: "Bạn cần đăng nhập tài khoản trước khi nhập key AI.", variant: "destructive" });
      return;
    }
    if (!redeemCode.trim()) return;
    try {
      const res = await postFunction<any>("/ai-sunny-redeem", { code: redeemCode, device_id: deviceId }, { authToken: token });
      if (!res?.ok) throw new Error(res?.msg ?? res?.code ?? "Redeem failed");
      toast({ title: "Đã mở AI", description: `${res.plan_code} tới ${res.expires_at ? new Date(res.expires_at).toLocaleString("vi-VN") : "hôm nay"}` });
      setRedeemCode("");
    } catch (e: any) {
      toast({ title: "Key không dùng được", description: e?.message ?? "Không thể nhập key.", variant: "destructive" });
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!token) {
      toast({ title: "Cần đăng nhập", description: "Tài khoản của bạn chưa đăng nhập nên chưa gọi được AI.", variant: "destructive" });
      return;
    }

    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const apiMessages = nextMessages.slice(-16).map((m) => ({ role: m.role, content: m.content }));
      const res = await postFunction<any>("/ai-sunny-chat", {
        model,
        mode: model.includes("tts") ? "tts" : "chat",
        device_id: deviceId,
        messages: apiMessages,
      }, { authToken: token });
      if (!res?.ok) throw new Error(res?.msg ?? res?.code ?? "AI request failed");
      setMessages((prev) => [...prev, { role: "assistant", content: String(res.answer ?? "") }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Không gọi được AI: ${e?.message ?? e}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_32%),linear-gradient(180deg,#fff,#f8fafc)]">
      <div className="page-wrap max-w-6xl py-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src="/android-chrome-512x512.png" alt="SUNNY" className="h-12 w-12 rounded-2xl object-cover shadow" />
            <div>
              <h1 className="text-2xl font-bold text-slate-950">SunnyMod Coding AI</h1>
              <p className="text-sm text-slate-500">AI hỗ trợ code, debug log, build Android/Supabase và ghi note kỹ thuật.</p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">{selectedModel.label}: {model}</Badge>
        </div>

        {!loading && !user && (
          <Card className="mb-5 border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle>Cần đăng nhập để sử dụng</CardTitle>
              <CardDescription>
                Trang AI dùng tài khoản và gói do admin cấp. Hãy đăng nhập bằng hệ thống của bạn hoặc nhập key sau khi đã có phiên tài khoản.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Model</CardTitle>
                <CardDescription>Chọn model theo gói đã mở.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${model === m.id ? "border-primary bg-primary/10" : "bg-white hover:bg-slate-50"}`}
                  >
                    <div className="font-semibold text-slate-950">{m.label}</div>
                    <div className="text-xs text-slate-500">{m.id}</div>
                    <div className="mt-1 text-xs text-slate-500">{m.desc}</div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Nhập key vượt</CardTitle>
                <CardDescription>Mở token/ngày hoặc model tạm thời.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input placeholder="AI-XXXXXX-XXXXXX" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} />
                <Button className="w-full" onClick={redeem}>Nhập key</Button>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-white/70">
              <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Chat</CardTitle>
              <CardDescription>Không dán secret/API key/service role vào chat. Log/code nên che thông tin nhạy cảm.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[62vh] overflow-y-auto p-4">
                <div className="space-y-4">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[92%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-900"}`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {sending && <div className="rounded-3xl bg-slate-100 px-4 py-3 text-sm text-slate-500">AI đang trả lời...</div>}
                  <div ref={bottomRef} />
                </div>
              </div>

              {showPlus && (
                <div className="border-t bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {MODELS.map((m) => (
                      <Button key={m.id} variant={model === m.id ? "default" : "soft"} onClick={() => { setModel(m.id); setShowPlus(false); }}>
                        {m.label}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Upload file/sandbox sẽ gắn sau khi admin bật gói Max.</p>
                </div>
              )}

              <div className="flex gap-2 border-t bg-white p-3">
                <Button variant="soft" size="icon" onClick={() => setShowPlus((v) => !v)}><Plus className="h-4 w-4" /></Button>
                <Textarea
                  className="min-h-[48px] flex-1 resize-none"
                  placeholder="Dán lỗi build, code, log hoặc yêu cầu debug..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <Button size="icon" onClick={send} disabled={sending || !input.trim()}><Send className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
