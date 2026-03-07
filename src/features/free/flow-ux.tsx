import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type FreeFlowStep = 1 | 2 | 3 | 4;

type FreeFlowStepsProps = {
  current: FreeFlowStep;
  compact?: boolean;
};

const STEP_LABELS = [
  "Chọn key",
  "Vượt link",
  "Xác thực",
  "Nhận key",
] as const;

export function FreeFlowSteps({ current, compact = false }: FreeFlowStepsProps) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-4")}>
      {STEP_LABELS.map((label, idx) => {
        const step = (idx + 1) as FreeFlowStep;
        const done = step < current;
        const active = step === current;
        return (
          <div
            key={label}
            className={cn(
              "relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition-all",
              done && "border-primary/40 bg-primary/[0.07]",
              active && "border-primary bg-primary/[0.10] shadow-sm ring-1 ring-primary/10",
              !done && !active && "bg-muted/25 text-muted-foreground",
            )}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/70 via-primary/40 to-transparent" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Bước {step}</span>
              <Badge variant={done || active ? "default" : "outline"} className="h-5 rounded-full px-2 text-[10px]">
                {done ? "Xong" : active ? "Đang xử lý" : "Chờ"}
              </Badge>
            </div>
            <div className="mt-2 text-sm font-semibold leading-tight text-foreground">{label}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {done ? "Hoàn tất bước này" : active ? "Bạn đang ở bước hiện tại" : "Hệ thống sẽ tự chuyển tiếp"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type FreeFlowDeviceHistory = {
  attemptsToday: number;
  successToday: number;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailCode?: string | null;
  lastKeyLabel?: string | null;
  nextEligibleAt?: string | null;
};

const STORAGE_KEY = "sunny_free_device_history_v1";

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function readFreeDeviceHistory(): FreeFlowDeviceHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { attemptsToday: 0, successToday: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<FreeFlowDeviceHistory> & { day?: string };
    if (parsed.day !== todayKey()) {
      return { attemptsToday: 0, successToday: 0 };
    }
    return {
      attemptsToday: Math.max(0, Number(parsed.attemptsToday ?? 0)),
      successToday: Math.max(0, Number(parsed.successToday ?? 0)),
      lastAttemptAt: parsed.lastAttemptAt ?? null,
      lastSuccessAt: parsed.lastSuccessAt ?? null,
      lastFailCode: parsed.lastFailCode ?? null,
      lastKeyLabel: parsed.lastKeyLabel ?? null,
      nextEligibleAt: parsed.nextEligibleAt ?? null,
    };
  } catch {
    return { attemptsToday: 0, successToday: 0 };
  }
}

function writeHistory(next: FreeFlowDeviceHistory) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        day: todayKey(),
        ...next,
      }),
    );
  } catch {
    // ignore
  }
}

export function markFreeAttempt() {
  const prev = readFreeDeviceHistory();
  writeHistory({
    ...prev,
    attemptsToday: prev.attemptsToday + 1,
    lastAttemptAt: new Date().toISOString(),
    lastFailCode: null,
  });
}

export function markFreeAttemptFail(code?: string | null) {
  const prev = readFreeDeviceHistory();
  writeHistory({
    ...prev,
    lastFailCode: code || "UNKNOWN",
  });
}

export function markFreeSuccess(args: { keyLabel?: string | null; nextEligibleAt?: string | null }) {
  const prev = readFreeDeviceHistory();
  writeHistory({
    ...prev,
    successToday: prev.successToday + 1,
    lastSuccessAt: new Date().toISOString(),
    lastKeyLabel: args.keyLabel ?? null,
    nextEligibleAt: args.nextEligibleAt ?? null,
    lastFailCode: null,
  });
}

export function formatRelativeCountdown(target?: string | null) {
  if (!target) return "-";
  const diffMs = new Date(target).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "-";
  if (diffMs <= 0) return "Có thể thử lại";
  const totalSeconds = Math.ceil(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)} phút`;
}

function friendlyFailLabel(code?: string | null) {
  const v = String(code || "").trim();
  if (!v) return "Chưa có lỗi gần đây";
  return v.replaceAll("_", " ");
}

export function FreeDeviceHistoryCard({ history }: { history: FreeFlowDeviceHistory }) {
  return (
    <Card className="overflow-hidden border-dashed bg-gradient-to-br from-background to-muted/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Thiết bị hiện tại</div>
            <div className="mt-1 text-sm font-medium text-foreground">Theo dõi nhanh lượt nhận key trong hôm nay</div>
          </div>
          <Badge variant="outline" className="rounded-full">Hôm nay</Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border bg-background/80 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Thành công</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{history.successToday}</div>
            <div className="text-xs text-muted-foreground">lượt đã nhận key</div>
          </div>
          <div className="rounded-2xl border bg-background/80 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Lần gần nhất</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{history.lastSuccessAt ? new Date(history.lastSuccessAt).toLocaleString("vi-VN") : "Chưa có"}</div>
            <div className="line-clamp-1 text-xs text-muted-foreground">{history.lastKeyLabel || "Chưa lưu key gần nhất"}</div>
          </div>
          <div className="rounded-2xl border bg-background/80 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Có thể thử lại</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatRelativeCountdown(history.nextEligibleAt)}</div>
            <div className="line-clamp-1 text-xs text-muted-foreground">
              {history.lastFailCode ? `Lỗi gần nhất: ${friendlyFailLabel(history.lastFailCode)}` : `${history.attemptsToday} lượt đã bắt đầu hôm nay`}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
