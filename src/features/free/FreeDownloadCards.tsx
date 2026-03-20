import { Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FreeConfig, FreeDownloadCard } from "./free-config";

function openSafe(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function DownloadCard({
  title,
  description,
  badge,
  buttonLabel,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  badge: string;
  buttonLabel: string;
  icon?: string | null;
  onClick: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border bg-gradient-to-br from-background to-muted/20 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-background/90">
            {icon ? (
              <img src={icon} alt={title} className="h-full w-full object-cover" />
            ) : (
              <FileText className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full">{badge}</Badge>
      </div>
      <Button type="button" className="h-11 w-full rounded-2xl sm:w-auto" onClick={onClick}>
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
    <div className="space-y-3">
      {cards.map((card, index) => (
        <DownloadCard
          key={`${card.url || "card"}-${index}`}
          title={card.title || `Link tải ${index + 1}`}
          description={card.description || "Liên kết ngoài do admin cấu hình cho người dùng free."}
          badge={card.badge || `Link ${index + 1}`}
          buttonLabel={card.button_label || "Mở liên kết"}
          icon={card.icon_url || null}
          onClick={() => openSafe(card.url as string)}
        />
      ))}
    </div>
  );
}
