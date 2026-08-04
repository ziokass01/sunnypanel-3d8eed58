import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FreeNoticeConfig } from "./free-config";

const HIDE_UNTIL_STORAGE_KEY = "freeImportantNoticeHideUntil";
const ONE_HOUR_MS = 60 * 60 * 1000;

function readStorageMap<T>(storage: Storage | undefined, key: string): Record<string, T> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeStorageMap<T>(storage: Storage | undefined, key: string, value: Record<string, T>) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
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

    const localStore = typeof window === "undefined" ? undefined : window.localStorage;
    const untilMap = readStorageMap<number>(localStore, HIDE_UNTIL_STORAGE_KEY);

    const now = Date.now();
    const hideUntil = Number(untilMap[noticeKey] ?? 0);

    if (hideUntil && hideUntil <= now) {
      delete untilMap[noticeKey];
      writeStorageMap(localStore, HIDE_UNTIL_STORAGE_KEY, untilMap);
    }

    setDismissed(hideUntil > now);
  }, [normalized, noticeKey]);

  if (!normalized || dismissed) return null;

  const dismissForCurrentView = () => {
    setDismissed(true);
  };

  const dismissForOneHour = () => {
    const localStore = typeof window === "undefined" ? undefined : window.localStorage;
    const untilMap = readStorageMap<number>(localStore, HIDE_UNTIL_STORAGE_KEY);
    untilMap[noticeKey] = Date.now() + ONE_HOUR_MS;
    writeStorageMap(localStore, HIDE_UNTIL_STORAGE_KEY, untilMap);
    setDismissed(true);
  };

  if (normalized.mode === "modal") {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && normalized.closable) dismissForCurrentView();
        }}
      >
        <DialogContent
          hideCloseButton
          onEscapeKeyDown={(event) => {
            if (!normalized.closable) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!normalized.closable) event.preventDefault();
          }}
          className="w-[calc(100vw-2.5rem)] max-w-[24rem] overflow-hidden rounded-[28px] border border-primary/20 bg-[#101010]/95 p-0 text-foreground shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:max-w-md"
        >
          <div className="bg-gradient-to-r from-primary/18 via-primary/8 to-transparent px-5 py-4">
            <DialogHeader className="space-y-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-primary/80">Thông báo</div>
                    <DialogTitle className="mt-1 text-left text-base font-semibold sm:text-lg">
                      {normalized.title}
                    </DialogTitle>
                  </div>
                </div>

                {normalized.closable ? (
                  <button
                    type="button"
                    onClick={dismissForCurrentView}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-background/70 text-muted-foreground transition hover:text-foreground"
                    aria-label="Đóng thông báo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </DialogHeader>
          </div>

          <div className="px-5 pb-5 pt-4">
            <div className="rounded-[22px] border border-primary/15 bg-primary/5 px-4 py-4 shadow-inner">
              <NoticeBody content={normalized.content} />
            </div>

            {normalized.closable ? (
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-primary/20"
                  onClick={dismissForCurrentView}
                >
                  Đóng
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={dismissForOneHour}
                >
                  <Clock3 className="mr-2 h-4 w-4" />
                  Tắt 1 giờ
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="mx-auto max-w-[28rem] rounded-[26px] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-4 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-2xl border border-primary/25 bg-primary/10 p-2.5 text-primary">
          <AlertTriangle className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-primary/80">Thông báo</div>
              <div className="mt-1 text-sm font-semibold text-foreground sm:text-base">{normalized.title}</div>
            </div>

            {normalized.closable ? (
              <button
                type="button"
                onClick={dismissForCurrentView}
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

          {normalized.closable ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-primary/20"
                onClick={dismissForCurrentView}
              >
                Đóng
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="rounded-2xl"
                onClick={dismissForOneHour}
              >
                <Clock3 className="mr-2 h-4 w-4" />
                Tắt 1 giờ
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
