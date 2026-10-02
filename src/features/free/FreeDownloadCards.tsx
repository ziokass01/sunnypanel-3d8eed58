import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FreeConfig, FreeDownloadCard } from "./free-config";

function openSafe(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function DownloadCard({
  title,
  description,
  buttonLabel,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  icon?: string | null;
  onClick: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border bg-gradient-to-br from-background to-muted/20 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-background/90">
            {icon ? (
              <img src={icon} alt={title} className="h-full w-full object-cover" />
            ) : (
              <FileText className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{title}</div>

          </div>
        </div>
      </div>
      <div className="download-notes space-y-2 border-t pt-3 text-sm leading-6 text-slate-600">{description.split(/\n+/).filter(Boolean).map((line, i) => <p key={i} className="whitespace-pre-wrap break-words">{line}</p>)}</div>
      <Button type="button" className="mt-auto h-11 w-full rounded-xl" onClick={onClick}>
        <Download className="mr-2 h-4 w-4" /> {buttonLabel}
      </Button>
    </div>
  );
}

function getLegacyCards(cfg: FreeConfig | null): FreeDownloadCard[] {
  const cards: FreeDownloadCard[] = [];

  if (cfg?.free_download_enabled && cfg?.free_download_url) {
    cards.push({
      enabled: true,
      title: cfg.free_download_name || "Tệp tải xuống",
      description: cfg.free_download_info || "Liên kết tải xuống do admin cấu hình.",
      url: cfg.free_download_url,
      button_label: "Mở liên kết",
      badge: "Link 1",
      icon_url: null,
    });
  }

  if (cfg?.free_external_download?.enabled && cfg?.free_external_download?.url) {
    cards.push({
      enabled: true,
      title: cfg.free_external_download.title || "Liên kết tải thêm",
      description: cfg.free_external_download.description || "Liên kết ngoài do admin cấu hình.",
      url: cfg.free_external_download.url,
      button_label: cfg.free_external_download.button_label || "Mở liên kết",
      badge: cfg.free_external_download.badge || "Link 2",
      icon_url: cfg.free_external_download.icon_url || null,
    });
  }

  return cards;
}

function getCards(cfg: FreeConfig | null): FreeDownloadCard[] {
  const cards = Array.isArray(cfg?.free_download_cards) ? cfg.free_download_cards : [];
  const usable = cards.filter(
    (card): card is FreeDownloadCard =>
      Boolean(card?.enabled && /^https?:\/\//i.test(String(card?.url ?? "").trim())),
  );
  return usable.length ? usable : getLegacyCards(cfg);
}

export function FreeDownloadCards({ cfg }: { cfg: FreeConfig | null }) {
  const cards = getCards(cfg);
  if (!cards.length) return null;

  return (
    <section id="downloads" className="scroll-mt-24 space-y-4">
      <div><h2 className="text-lg font-semibold">Tải ứng dụng</h2><p className="mt-1 text-sm text-muted-foreground">Chọn đúng bản và đọc ghi chú trước khi tải.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      {cards.map((card, index) => (
        <DownloadCard
          key={`${card.url || "card"}-${index}`}
          title={card.title || `Link tải ${index + 1}`}
          description={card.description || "Liên kết ngoài do admin cấu hình cho người dùng free."}
          buttonLabel={card.button_label || "Mở liên kết"}
          icon={card.icon_url || null}
          onClick={() => openSafe(card.url as string)}
        />
      ))}
      </div>
    </section>
  );
}
