import { useMemo, useState } from "react";
import { ArrowUpRight, KeyRound, ShieldCheck, Youtube, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const LINKS = {
  admin: "https://zalo.me/84373752504",
  ytb: "https://www.youtube.com/@SunnyShareRegXTevez",
  community: "https://zalo.me/g/dxxtbh214",
  getKey: "https://mityangho.id.vn/free",
};

function openLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function FakeLagPortalPage() {
  const [keyValue, setKeyValue] = useState("");

  const normalizedKey = useMemo(() => String(keyValue || "").trim().toUpperCase(), [keyValue]);

  const onLogin = () => {
    if (!normalizedKey) return;
    const url = `${LINKS.getKey}?app=fake-lag&key=${encodeURIComponent(normalizedKey)}`;
    window.location.assign(url);
  };

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.24),_transparent_30%),linear-gradient(180deg,#091225_0%,#050914_100%)] text-white">
      <main className="mx-auto flex min-h-svh max-w-6xl items-center justify-center px-4 py-10">
        <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <section className="flex items-center">
            <div className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-[0_30px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:p-7">
              <div className="mb-5 flex items-center gap-4">
                <img
                  src="/android-chrome-512x512.png"
                  alt="SunnyMod"
                  className="h-16 w-16 rounded-[1.4rem] border border-cyan-300/30 object-cover shadow-[0_0_32px_rgba(34,211,238,0.26)]"
                />
                <div>
                  <Badge className="border-cyan-300/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/10">SunnyMod • Fake Lag</Badge>
                  <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Đăng nhập bằng key</h1>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                    Giao diện lấy cảm hứng từ style app tối hiện đại. Bản này chỉ giữ một ô nhập key, nút đăng nhập và nút Get key để tránh đụng vào flow cũ.
                  </p>
                </div>
              </div>

              <Card className="overflow-hidden border-white/10 bg-slate-950/55 text-white shadow-none">
                <CardContent className="space-y-5 p-5 sm:p-6">
                  <div className="rounded-[1.5rem] border border-cyan-400/20 bg-white/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                      <KeyRound className="h-4 w-4 text-cyan-300" />
                      Nhập key của bạn
                    </div>
                    <Input
                      value={keyValue}
                      onChange={(event) => setKeyValue(event.target.value)}
                      placeholder="Ví dụ: FL-SUNNY-XXXX-XXXX"
                      className="h-14 rounded-2xl border-white/10 bg-slate-950/70 text-base text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="grid gap-3">
                    <Button className="h-14 rounded-2xl bg-[linear-gradient(90deg,#ec4899_0%,#8b5cf6_100%)] text-base font-semibold text-white shadow-[0_18px_40px_rgba(236,72,153,0.35)] hover:opacity-95" onClick={onLogin} disabled={!normalizedKey}>
                      Đăng nhập
                    </Button>
                    <Button variant="outline" className="h-12 rounded-2xl border-cyan-300/30 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/20" onClick={() => openLink(LINKS.getKey)}>
                      Get key
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button variant="outline" className="justify-between rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => openLink(LINKS.admin)}>
                      <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Admin</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="justify-between rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => openLink(LINKS.ytb)}>
                      <span className="inline-flex items-center gap-2"><Youtube className="h-4 w-4" /> Ytb</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="justify-between rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => openLink(LINKS.community)}>
                      <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Cộng đồng</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="justify-between rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => openLink(LINKS.getKey)}>
                      <span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" /> Getkey</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-4">
            <Card className="rounded-[2rem] border border-white/10 bg-white/5 text-white shadow-[0_20px_60px_rgba(2,6,23,0.35)] backdrop-blur-xl">
              <CardContent className="space-y-4 p-6">
                <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100 hover:bg-amber-300/10">Bổ sung trong repo</Badge>
                <h2 className="text-2xl font-semibold">Fake Lag app-host</h2>
                <ul className="space-y-3 text-sm leading-7 text-slate-300">
                  <li>• Thêm app <span className="font-medium text-white">Fake Lag</span> vào Server app.</li>
                  <li>• Có trang tổng quan cấu hình, server key, trung tâm điều khiển, audit log và trash.</li>
                  <li>• Dùng key signature riêng cho app để tách khỏi app khác.</li>
                  <li>• Get key public trỏ về <span className="font-medium text-white">mityangho.id.vn/free</span>.</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border border-white/10 bg-slate-950/55 text-white shadow-none">
              <CardContent className="space-y-3 p-6 text-sm leading-7 text-slate-300">
                <div className="font-semibold text-white">Gợi ý bảo vệ app an toàn</div>
                <p>
                  Phần repo này chỉ thêm luồng quản trị và giao diện. Với chống crack, nên dùng chữ ký app riêng, token ngắn hạn từ server, kiểm tra thiết bị/IP và audit log. Không nên triển khai cơ chế phá hoại hoặc “nổ all” khi nghi ngờ crack.
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
