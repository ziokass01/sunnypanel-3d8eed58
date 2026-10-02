import { Link } from "react-router-dom";
import { ArrowRight, KeyRound, RotateCcw } from "lucide-react";
import { CommunityBanner, PublicHeader } from "@/features/support/SupportViews";
import ZaloGetKeyBubble from "@/components/ZaloGetKeyBubble";

export function ServiceLandingPage() {
  return (
    <div className="sunny-public min-h-svh">
      <PublicHeader />
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-6 sm:py-10">
        <section className="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="py-4">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
              SunnyMod · Key & ứng dụng
            </p>
            <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              Mọi thứ bạn cần,
              <br />
              <span className="text-sky-700">ngay tại đây.</span>
            </h1>
          </div>
          <CommunityBanner />
        </section>
        <section
          aria-label="Các chức năng"
          className="grid gap-4 sm:grid-cols-2"
        >
          {[
            {
              to: "/free",
              icon: KeyRound,
              title: "Lấy key miễn phí",
              description:
                "Chọn loại key, hoàn tất vượt link và nhận key trong cùng trình duyệt.",
            },
            {
              to: "/reset-key",
              icon: RotateCcw,
              title: "Reset key",
              description:
                "Kiểm tra hạn sử dụng và reset thiết bị theo điều kiện của key.",
            },
          ].map((x) => (
            <Link
              key={x.to}
              to={x.to}
              className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-amber-400"
            >
              <x.icon className="mb-5 h-7 w-7 text-sky-700" />
              <h2 className="text-xl font-semibold">{x.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {x.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
                Bắt đầu
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </section>
        <footer className="border-t pt-5 text-sm text-slate-500">
          © SunnyMod · mityangho.id.vn
        </footer>
      </main>
      <ZaloGetKeyBubble />
    </div>
  );
}
