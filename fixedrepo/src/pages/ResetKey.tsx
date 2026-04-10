import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { postFunction } from "@/lib/functions";
import { TurnstileWidget } from "@/components/turnstile/TurnstileWidget";
import { syncFreeNextEligibleAt } from "@/features/free/flow-ux";
import { CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ResetKeyPayload = {
  ok: boolean;
  msg: string;
  key?: string;
  key_kind?: string;
  created_at?: string | null;
  expires_at?: string | null;
  remaining_seconds?: number | null;
  status?: string;
  http_status?: number;
  device_count?: number;
  max_devices?: number;
  admin_reset_count?: number;
  public_reset_count?: number;
  penalty_pct?: number;
  penalty_seconds?: number;
  devices_removed?: number;
  reset_enabled?: boolean;
  disabled_message?: string | null;
  public_reset_disabled?: boolean;
  next_reset_penalty_pct?: number | null;
  next_reset_will_expire?: boolean;
  public_reset_cancel_after_count?: number | null;
  code?: string;
};

const LAST_FREE_KEY_STORAGE = "lastFreeKey";

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function formatRemaining(seconds?: number | null) {
  if (seconds == null) return "Không giới hạn";
  const total = Math.max(0, Math.floor(seconds));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const parts: string[] = [];
  if (d > 0) parts.push(`${d} ngày`);
  if (h > 0) parts.push(`${h} giờ`);
  if (m > 0) parts.push(`${m} phút`);
  if (s > 0 || parts.length === 0) parts.push(`${s} giây`);
  return parts.join(" ");
}

function statusVariant(status?: string) {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "default" as const;
    case "expired":
    case "blocked":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function statusLabel(status?: string) {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "Đang hoạt động";
    case "expired":
      return "Hết hạn";
    case "blocked":
      return "Đã chặn";
    case "not_started":
      return "Chưa sử dụng";
    default:
      return status || "Không rõ";
  }
}

function describeResultMessage(result: ResetKeyPayload | null) {
  const msg = String(result?.msg ?? "");
  if (msg === "TURNSTILE_REQUIRED") return "Chỉ cần xác minh Turnstile trước khi bấm Reset. Check key không cần Turnstile.";
  if (msg === "TURNSTILE_FAILED") return "Xác minh Turnstile không hợp lệ hoặc đã hết hạn. Vui lòng xác minh lại rồi thử tiếp.";
  if (msg === "RATE_LIMIT") return "Bạn thao tác quá nhanh trên cùng IP hoặc cùng key. Vui lòng chờ một lúc rồi thử lại.";
  if (msg === "KEY_UNAVAILABLE") return "Key không tồn tại, đã bị xóa, bị chặn hoặc đã hết hạn.";
  if (msg === "KEY_RESET_DISABLED") return "Key này đã bị admin khóa reset, không thể reset từ trang public.";
  return msg;
}

function syncLastFreeKeySnapshot(result: ResetKeyPayload) {
  const normalizedKey = String(result.key ?? "").trim().toUpperCase();
  if (!normalizedKey) return;

  try {
    const raw = localStorage.getItem(LAST_FREE_KEY_STORAGE);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const storedKey = String(parsed?.key ?? "").trim().toUpperCase();
    if (!storedKey || storedKey !== normalizedKey) return;

    const next = {
      ...parsed,
      key: result.key ?? parsed.key,
      key_type: result.key_kind === "FREE"
        ? "Key free"
        : result.key_kind === "PAID"
          ? "Key mua / admin"
          : parsed.key_type ?? null,
      created_at: result.created_at ?? parsed.created_at ?? null,
      expires_at: result.expires_at ?? parsed.expires_at ?? null,
    };
    localStorage.setItem(LAST_FREE_KEY_STORAGE, JSON.stringify(next));
    syncFreeNextEligibleAt(result.expires_at ?? null);
  } catch {
    // ignore local sync errors
  }
}

export function ResetKeyPage() {
  const [key, setKey] = useState("");
  const [loadingAction, setLoadingAction] = useState<"check" | "reset" | null>(null);
  const [result, setResult] = useState<ResetKeyPayload | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const [lastCompletedAction, setLastCompletedAction] = useState<"check" | "reset" | null>(null);
  const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim();

  const normalizedKey = useMemo(() => key.trim().toUpperCase(), [key]);

  useEffect(() => {
    try {
      const qsKey = new URLSearchParams(window.location.search).get("key");
      const normalized = String(qsKey || "").trim().toUpperCase();
      if (/^SUNNY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(normalized)) {
        setKey(normalized);
      }
    } catch {
      // ignore invalid query params
    }
  }, []);
  const hasValidData = useMemo(() => {
    if (!result?.ok) return false;
    if (!result.key || !result.key_kind || !result.status) return false;
    return /^SUNNY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(result.key);
  }, [result]);

  const licenseResetLocked = Boolean(
    result?.ok
      && result?.key
      && String(result.key).trim().toUpperCase() === normalizedKey
      && result.public_reset_disabled,
  );

  const nextResetHardExpire = Boolean(
    result?.ok
      && result?.key
      && String(result.key).trim().toUpperCase() === normalizedKey
      && result.next_reset_will_expire,
  );

  const toUiError = useCallback((e: any): ResetKeyPayload => {
    const msg = String(e?.message ?? "Có lỗi xảy ra");
    return {
      ok: false,
      msg,
      code: typeof e?.code === "string" ? e.code : undefined,
      http_status: typeof e?.status === "number" ? e.status : undefined,
    };
  }, []);

  const handleTurnstileTokenChange = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  async function runAction(action: "check" | "reset") {
    if (!normalizedKey) return;

    if (action === "reset" && turnstileSiteKey && !turnstileToken) {
      setResult({ ok: false, msg: "TURNSTILE_REQUIRED" });
      return;
    }

    setResult(null);
    setLoadingAction(action);

    try {
      const res = await postFunction<ResetKeyPayload>("/reset-key", {
        action,
        key: normalizedKey,
        turnstile_token: action === "reset" ? turnstileToken : undefined,
      });
      setResult(res);
      if (res?.ok) {
        setLastCompletedAction(action);
        syncLastFreeKeySnapshot(res);
      }
    } catch (e: any) {
      setResult(toUiError(e));
    } finally {
      setLoadingAction(null);
      if (action === "reset" && turnstileSiteKey) {
        setTurnstileToken(null);
        setTurnstileNonce((n) => n + 1);
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Reset Key</h1>
        <p className="text-sm text-muted-foreground">
          Kiểm tra thời hạn key và reset thiết bị trực tiếp cho người dùng.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Dán key để kiểm tra hoặc reset</CardTitle>
          <CardDescription>
            Key free: mặc định lần đầu trừ 50%. Key mua/admin: mặc định lần đầu không trừ, từ lần sau trừ 20%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="SUNNY-XXXX-XXXX-XXXX"
            className="font-mono"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="soft"
              disabled={!normalizedKey || loadingAction !== null}
              onClick={() => void runAction("check")}
            >
              {loadingAction === "check" ? "Đang kiểm tra..." : "Check key"}
            </Button>

            <Button
              disabled={!normalizedKey || loadingAction !== null || licenseResetLocked}
              onClick={() => setConfirmOpen(true)}
            >
              {loadingAction === "reset" ? "Đang reset..." : "Reset key"}
            </Button>
          </div>

          {result?.reset_enabled === false ? (
            <div className="rounded-xl border p-3 text-sm text-muted-foreground">
              {result.disabled_message || "Tính năng reset đang tạm đóng."}
            </div>
          ) : null}

          {licenseResetLocked ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Key này đang bị admin khóa reset. Bạn vẫn có thể Check key, nhưng không thể Reset key từ trang public.
            </div>
          ) : null}

          {nextResetHardExpire ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              Cảnh báo: nếu reset lần này, key sẽ bị hủy về trạng thái hết hạn theo luật giới hạn số lần reset hiện tại.
            </div>
          ) : null}

          <div className="rounded-xl border p-3 text-sm text-muted-foreground">
            Vì lý do chống dò key và chống abuse, hệ thống sẽ giới hạn tần suất kiểm tra/reset và có thể trả thông báo chung khi key không khả dụng.
          </div>

          {!turnstileSiteKey ? (
            <div className="rounded-xl border p-3 text-sm text-muted-foreground">
              Turnstile chưa được cấu hình ở frontend. Trang vẫn hoạt động bình thường; nếu quản trị viên bật bắt buộc Turnstile ở backend thì bạn sẽ được nhắc bổ sung xác minh.
            </div>
          ) : (
            <>
              <TurnstileWidget
                key={turnstileNonce}
                className="rounded-xl border p-3"
                siteKey={turnstileSiteKey}
                onTokenChange={handleTurnstileTokenChange}
              />
              <div className="rounded-xl border p-3 text-sm text-muted-foreground">
                Chỉ cần xác minh Turnstile trước khi bấm <span className="font-medium text-foreground">Reset</span>. Check key không cần Turnstile.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {result?.ok && hasValidData && lastCompletedAction === "reset" ? (
        <Card className="rounded-2xl border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-foreground">Reset Key 🗝 thành công</div>
                <Badge className="rounded-full">Đã áp dụng</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {result.status === "expired" && result.public_reset_cancel_after_count && result.public_reset_cancel_after_count > 0
                  ? `Key này đã bị hủy về trạng thái hết hạn vì đã chạm mốc ${result.public_reset_cancel_after_count} lần reset.`
                  : "Hệ thống đã cập nhật key này theo chính sách hiện tại. Kiểm tra chi tiết bên dưới để xem thời gian còn lại và số thiết bị sau khi reset."}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}


      {result?.ok && hasValidData ? (
        <Card className="rounded-2xl">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Trạng thái key</CardTitle>
              <Badge variant={statusVariant(result.status)}>{statusLabel(result.status)}</Badge>
            </div>
            <CardDescription>
              {result.ok ? "Đã lấy thông tin mới nhất từ hệ thống." : describeResultMessage(result)}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Key</div>
                <div className="mt-1 font-mono text-sm break-all">{result.key ?? normalizedKey}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Loại key</div>
                <div className="mt-1 text-sm">{result.key_kind === "FREE" ? "Key free" : "Key mua / admin"}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Tạo lúc</div>
                <div className="mt-1 text-sm">{formatDateTime(result.created_at)}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Hết hạn</div>
                <div className="mt-1 text-sm">{result.expires_at ? formatDateTime(result.expires_at) : "Không giới hạn"}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Thời gian còn lại</div>
                <div className="mt-1 text-sm">{result.expires_at ? formatRemaining(result.remaining_seconds) : "Không giới hạn"}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Thiết bị</div>
                <div className="mt-1 text-sm">
                  {result.device_count ?? 0}/{result.max_devices ?? 0}
                </div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Public reset</div>
                <div className="mt-1 text-sm">{result.public_reset_count ?? 0}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Admin reset</div>
                <div className="mt-1 text-sm">{result.admin_reset_count ?? 0}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Reset public</div>
                <div className="mt-1 text-sm">{result.public_reset_disabled ? "Đã khóa bởi admin" : "Được phép"}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Lần reset kế tiếp</div>
                <div className="mt-1 text-sm">
                  {result.next_reset_will_expire
                    ? "Sẽ hủy key"
                    : typeof result.next_reset_penalty_pct === "number"
                      ? `Trừ ${result.next_reset_penalty_pct}%`
                      : "Theo luật hiện tại"}
                </div>
              </div>
            </div>

            {typeof result.penalty_pct === "number" && result.penalty_pct > 0 ? (
              <div className="rounded-xl border p-3 text-sm">
                Hệ thống vừa áp dụng mức trừ <span className="font-semibold">{result.penalty_pct}%</span>
                {typeof result.penalty_seconds === "number" ? `, tương đương ${formatRemaining(result.penalty_seconds)}.` : "."}
              </div>
            ) : null}

            {typeof result.devices_removed === "number" && result.devices_removed > 0 ? (
              <div className="rounded-xl border p-3 text-sm text-muted-foreground">
                Đã xóa {result.devices_removed} thiết bị khỏi key này.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {result && !hasValidData ? (
        <Card className="rounded-2xl border-destructive/50">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Không thể lấy thông tin key</CardTitle>
              <Badge variant="destructive">Lỗi</Badge>
            </div>
            <CardDescription>{describeResultMessage(result)}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận reset key?</AlertDialogTitle>
            <AlertDialogDescription>
              {licenseResetLocked
                ? "Key này đang bị admin khóa reset, không thể reset từ trang public."
                : nextResetHardExpire
                  ? `Cảnh báo: nếu reset lần này, key sẽ bị hủy về trạng thái hết hạn${Number(result?.public_reset_cancel_after_count ?? 0) > 0 ? ` vì đã chạm mốc ${result?.public_reset_cancel_after_count} lần reset` : ""}.`
                  : "Hệ thống sẽ xóa toàn bộ thiết bị của key này. Nếu là key free hoặc key đã reset nhiều lần, thời gian còn lại có thể bị trừ theo chính sách hiện tại."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={loadingAction === "reset"}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={loadingAction === "reset" || !normalizedKey || licenseResetLocked}
              onClick={() => {
                setConfirmOpen(false);
                void runAction("reset");
              }}
            >
              {loadingAction === "reset" ? "Đang reset..." : "Xác nhận reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
