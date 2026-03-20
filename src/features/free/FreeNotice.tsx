import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FreeNoticeConfig } from "./free-config";

const STORAGE_KEY = "freeImportantNoticeState";

function readDismissedState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function writeDismissedState(value: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getNoticeKey(notice: FreeNoticeConfig) {
  return [notice.title ?? "", notice.content ?? "", notice.mode, notice.closable ? "1" : "0"].join("::");
}

function NoticeBody({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-6 text-muted-foreground">
      {content.split(/\n+/).filter(Boolean).map((line, index) => (
        <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>
      ))}
    </div>
  );
}

export function FreeNotice({ notice }: { notice?: FreeNoticeConfig | null }) {
  const normalized = useMemo(() => {
    const title = String(notice?.title ?? "").trim();
    const content = String(notice?.content ?? "").trim();
    if (!notice?.enabled || !content) return null;
    return {
      ...notice,
      title: title || "Thông báo quan trọng",
      content,
    };
  }, [notice]);

  const noticeKey = useMemo(() => (normalized ? getNoticeKey(normalized) : ""), [normalized]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!normalized) {
      setDismissed(false);
      return;
    }
    if (!normalized.showOnce) {
      setDismissed(false);
      return;
    }
    const dismissedMap = readDismissedState();
    setDismissed(Boolean(dismissedMap[noticeKey]));
  }, [normalized, noticeKey]);

  if (!normalized || dismissed) return null;

  const handleDismiss = () => {
    if (normalized.showOnce) {
      const dismissedMap = readDismissedState();
      dismissedMap[noticeKey] = true;
      writeDismissedState(dismissedMap);
    }
    setDismissed(true);
  };

  if (normalized.mode === "modal") {
    return (
      <Dialog open onOpenChange={(open) => {
        if (!open && normalized.closable) handleDismiss();
      }}>
        <DialogContent
          hideCloseButton={!normalized.closable}
          onEscapeKeyDown={(event) => {
            if (!normalized.closable) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!normalized.closable) event.preventDefault();
          }}
          className="border-primary/30 bg-[#111111] text-foreground shadow-2xl sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertTriangle className="h-5 w-5 text-primary" />
              {normalized.title}
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <NoticeBody content={normalized.content} />
          </div>
          {normalized.closable ? (
            <div className="flex justify-end">
              <Button type="button" variant="secondary" className="rounded-2xl" onClick={handleDismiss}>
                Đã hiểu
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full border border-primary/30 bg-primary/10 p-2 text-primary">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-primary/80">Thông báo quan trọng</div>
              <div className="mt-1 text-sm font-semibold text-foreground sm:text-base">{normalized.title}</div>
            </div>
            {normalized.closable ? (
              <button
                type="button"
                onClick={handleDismiss}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-background/70 text-muted-foreground transition hover:text-foreground",
                )}
                aria-label="Đóng thông báo"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <NoticeBody content={normalized.content} />
        </div>
      </div>
    </div>
  );
}
