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
              "rounded-xl border px-3 py-2 text-left transition-colors",
              done && "border-primary/40 bg-primary/5",
              active && "border-primary bg-primary/10 shadow-sm",
              !done && !active && "bg-muted/30 text-muted-foreground",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide">Bước {step}</span>
              <Badge variant={done || active ? "default" : "outline"} className="h-5 px-2 text-[10px]">
                {done ? "Xong" : active ? "Đang xử lý" : "Chờ"}
              </Badge>
            </div>
            <div className="mt-1 text-sm font-medium">{label}</div>
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

export function FreeDeviceHistoryCard({ history }: { history: FreeFlowDeviceHistory }) {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Thiết bị này hôm nay</div>
          <div className="mt-1 text-2xl font-semibold">{history.successToday}</div>
          <div className="text-xs text-muted-foreground">lượt nhận key thành công</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Lần gần nhất</div>
          <div className="mt-1 text-sm font-medium">{history.lastSuccessAt ? new Date(history.lastSuccessAt).toLocaleString("vi-VN") : "Chưa có"}</div>
          <div className="text-xs text-muted-foreground">{history.lastKeyLabel || "Chưa có key nào được lưu"}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Có thể thử lại</div>
          <div className="mt-1 text-sm font-medium">{formatRelativeCountdown(history.nextEligibleAt)}</div>
          <div className="text-xs text-muted-foreground">
            {history.lastFailCode ? `Lỗi gần nhất: ${history.lastFailCode}` : `${history.attemptsToday} lượt bắt đầu hôm nay`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
