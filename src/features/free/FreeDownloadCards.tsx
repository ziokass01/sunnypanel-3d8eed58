import { Download, ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FreeConfig } from "./free-config";

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

export function FreeDownloadCards({ cfg }: { cfg: FreeConfig | null }) {
  const primaryVisible = Boolean(cfg?.free_download_enabled && cfg?.free_download_url);
  const external = cfg?.free_external_download;
  const secondaryVisible = Boolean(external?.enabled && external?.url);

  if (!primaryVisible && !secondaryVisible) return null;

  return (
    <div className="space-y-3">
      {primaryVisible ? (
        <DownloadCard
          title={cfg?.free_download_name || "Tệp tải xuống"}
          description={cfg?.free_download_info || "Bản file được admin ghim sẵn cho trang free."}
          badge="Free"
          buttonLabel="Tải file 📥"
          onClick={() => openSafe(cfg?.free_download_url as string)}
        />
      ) : null}

      {secondaryVisible ? (
        <div className="space-y-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/20 bg-background/90">
                {external?.icon_url ? (
                  <img src={external.icon_url} alt={external?.title || "External download"} className="h-full w-full object-cover" />
                ) : (
                  <ExternalLink className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{external?.title || "Liên kết tải thêm"}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {external?.description || "Liên kết ngoài bổ sung do admin cấu hình cho người dùng free."}
                </div>
              </div>
            </div>
            <Badge className="rounded-full bg-primary/15 text-primary hover:bg-primary/20">{external?.badge || "External"}</Badge>
          </div>
          <Button type="button" variant="secondary" className="h-11 w-full rounded-2xl sm:w-auto" onClick={() => openSafe(external?.url as string)}>
            <ExternalLink className="mr-2 h-4 w-4" /> {external?.button_label || "Mở liên kết"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
