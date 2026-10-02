import {
  ArrowUpRight,
  Link2,
  MessageCircle,
  Send,
  Users,
  Youtube,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  safeSupportUrl,
  useSupport,
  type SupportConfig,
  type SupportLink,
} from "./config";

export function SupportIcon({
  platform,
}: {
  platform: SupportLink["platform"];
}) {
  const Icon =
    platform === "telegram"
      ? Send
      : platform === "zalo"
        ? MessageCircle
        : platform === "youtube"
          ? Youtube
          : Link2;
  return <Icon className="h-5 w-5 shrink-0" />;
}
export function SupportLinks({ config }: { config: SupportConfig }) {
  return (
    <div className="space-y-2">
      {config.links
        .filter((l) => l.enabled && safeSupportUrl(l.url))
        .map((l) => (
          <a
            key={l.id}
            href={safeSupportUrl(l.url)!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 transition hover:border-sky-400 hover:bg-sky-50"
          >
            <span className="rounded-xl bg-sky-100 p-3 text-sky-700">
              <SupportIcon platform={l.platform} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block break-words text-sm">{l.label}</strong>
              <span className="block break-words text-xs leading-5 text-slate-600">
                {l.description}
              </span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500" />
          </a>
        ))}
    </div>
  );
}
export function CommunityBanner({
  preview,
  compact = false,
}: {
  preview?: SupportConfig;
  compact?: boolean;
}) {
  const { config: saved } = useSupport();
  const config = preview ?? saved;
  const groups = config.links.filter(
    (l) => l.enabled && l.placement === "community" && safeSupportUrl(l.url),
  );
  if (!config.banner_enabled || !groups.length) return null;
  return (
    <section
      aria-label="Nhóm cộng đồng"
      className={`${compact ? "community-compact" : ""} community-banner overflow-hidden rounded-3xl bg-slate-950 p-5 text-white sm:p-6`}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-white/10 p-3 text-amber-300">
          <Users className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-amber-300">
            Cùng SunnyMod
          </p>
          <h2 className="break-words text-xl font-semibold text-white">
            {config.community_title}
          </h2>
          <p className="mt-2 max-w-xl break-words text-sm leading-6 text-slate-300">
            {config.community_description}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {groups.map((l) => (
          <a
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            key={l.id}
            href={safeSupportUrl(l.url)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            <SupportIcon platform={l.platform} />
            <span className="break-words">{l.label}</span>
            <ArrowUpRight className="h-4 w-4 shrink-0" />
          </a>
        ))}
      </div>
    </section>
  );
}
export function PublicHeader() {
  return (
    <header className="sunny-public-header">
      <Link
        to="/"
        className="flex shrink-0 items-center gap-2 font-bold text-slate-950"
      >
        <img
          src="/brand.png"
          alt=""
          className="h-9 w-9 rounded-xl object-cover"
        />
        SunnyMod
      </Link>
      <nav
        aria-label="Điều hướng"
        className="flex flex-wrap items-center gap-1 text-sm"
      >
        <Link to="/free">Lấy key</Link>
        <Link to="/reset-key">Reset key</Link>
        <a href="/free#downloads">Tải ứng dụng</a>
      </nav>
    </header>
  );
}
