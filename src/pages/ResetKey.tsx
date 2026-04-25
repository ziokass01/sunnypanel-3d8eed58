import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { postFunction } from "@/lib/functions";
import { TurnstileWidget } from "@/components/turnstile/TurnstileWidget";
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
  app_code?: string | null;
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

const PUBLIC_KEY_RE = /^[A-Z0-9]{2,16}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

function normalizePublicKey(value: string) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function keyPrefix(value?: string | null) {
  return String(value || "").split("-")[0]?.toUpperCase() || "";
}

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
    case "limited":
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
    case "limited":
      return "Hết lượt";
    case "not_started":
      return "Chưa sử dụng";
    default:
      return status || "Không rõ";
  }
}

function keyKindLabel(result: ResetKeyPayload) {
  const kind = String(result.key_kind || result.app_code || "").toUpperCase();
  const prefix = keyPrefix(result.key);

  if (kind === "FREE") return "Key free";
  if (kind === "PAID") return "Key mua / admin";
  if (kind.includes("FAKE") || prefix === "FAKELAG") return "Fake Lag";
  if (kind.includes("FIND") || prefix === "FD" || prefix === "FND") return "Find Dumps";
  if (prefix === "SUNNY") return "Free Fire / SUNNY";
  return kind || prefix || "Không rõ";
}

function describeResultMessage(result: ResetKeyPayload | null) {
  const msg = String(result?.msg ?? "");
  if (msg === "TURNSTILE_REQUIRED") return "Vui lòng xác minh Turnstile trước khi bấm Reset. Check key không cần Turnstile.";
  if (msg === "TURNSTILE_FAILED") return "Xác minh Turnstile không hợp lệ hoặc đã hết hạn. Vui lòng xác minh lại rồi thử tiếp.";
  if (msg === "RATE_LIMIT") return "Bạn thao tác quá nhanh trên cùng IP hoặc cùng key. Vui lòng chờ một lúc rồi thử lại.";
  if (msg === "KEY_UNAVAILABLE") return "Key không tồn tại, đã bị xóa, bị chặn, hết hạn hoặc không thuộc hệ thống reset public.";
  if (msg === "KEY_RESET_DISABLED") return "Key này đã bị admin khóa reset, không thể reset từ trang public.";
  if (msg === "RESET_OK") return "Reset key thành công.";
  if (msg === "OK") return "Đã lấy thông tin mới nhất từ hệ thống.";
  return msg || "Có lỗi xảy ra.";
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

  const normalizedKey = useMemo(() => normalizePublicKey(key), [key]);

  useEffect(() => {
    try {
      const qsKey = new URLSearchParams(window.location.search).get("key");
      const normalized = normalizePublicKey(qsKey || "");
      if (PUBLIC_KEY_RE.test(normalized)) setKey(normalized);
    } catch {
      // ignore invalid query params
    }
  }, []);

  const hasValidData = useMemo(() => {
    if (!result?.ok) return false;
    if (!result.key || !result.key_kind || !result.status) return false;
    return PUBLIC_KEY_RE.test(result.key);
  }, [result]);

  const licenseResetLocked = Boolean(
    result?.ok
      && result?.key
      && normalizePublicKey(result.key) === normalizedKey
      && result.public_reset_disabled,
  );

  const nextResetHardExpire = Boolean(
    result?.ok
      && result?.key
      && normalizePublicKey(result.key) === normalizedKey
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

  async function runAction(action: "check" | "reset") {
    if (!normalizedKey) return;

    if (!PUBLIC_KEY_RE.test(normalizedKey)) {
      setResult({ ok: false, msg: "KEY_UNAVAILABLE" });
      return;
    }

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

      // Fake Lag/public reset must return a full status card after reset.
      // If an older deployed backend answers only OK/partial payload, immediately re-check the key
      // so the page does not show the confusing "Không thể lấy thông tin key / OK" state.
      let finalRes = res;
      if (action === "reset" && (!res?.key || !res?.status || String(res?.msg ?? "").toUpperCase() === "OK")) {
        try {
          const fresh = await postFunction<ResetKeyPayload>("/reset-key", {
            action: "check",
            key: normalizedKey,
          });
          if (fresh?.ok) {
            finalRes = {
              ...fresh,
              msg: "RESET_OK",
              devices_removed: res?.devices_removed,
              penalty_pct: res?.penalty_pct,
              penalty_seconds: res?.penalty_seconds,
            };
          }
        } catch {
          // Keep original response if follow-up check fails.
        }
      }

      setResult(finalRes);
      if (finalRes?.ok) setLastCompletedAction(action);
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
          Kiểm tra và reset key Free Fire, Find Dumps, Fake Lag. Hệ thống nhận dạng theo chữ ký key: SUNNY, FAKELAG, FD/FND.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Dán key để kiểm tra hoặc reset</CardTitle>
          <CardDescription>
            Check key dùng để xem trạng thái. Reset sẽ xóa lượt dùng/thiết bị theo đúng loại key và chính sách server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="SUNNY-XXXX-XXXX-XXXX hoặc FAKELAG-XXXX-XXXX-XXXX"
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
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
              Cảnh báo: nếu reset lần này, key sẽ bị hủy về trạng thái hết hạn theo luật giới hạn số lần reset hiện tại.
            </div>
          ) : null}

          <div className="rounded-xl border p-3 text-sm text-muted-foreground">
            Vì lý do chống dò key và chống abuse, hệ thống sẽ giới hạn tần suất kiểm tra/reset và có thể trả thông báo chung khi key không khả dụng.
          </div>

          {!turnstileSiteKey ? (
            <div className="rounded-xl border p-3 text-sm text-muted-foreground">
              Turnstile chưa được cấu hình ở frontend. Check vẫn hoạt động; nếu backend bắt buộc Turnstile thì reset sẽ yêu cầu bổ sung xác minh.
            </div>
          ) : (
            <>
              <TurnstileWidget
                key={turnstileNonce}
                className="rounded-xl border p-3"
                siteKey={turnstileSiteKey}
                onTokenChange={setTurnstileToken}
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
                <div className="text-sm font-semibold text-foreground">Reset Key thành công</div>
                <Badge className="rounded-full">Đã áp dụng</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Hệ thống đã cập nhật key này. Kiểm tra chi tiết bên dưới để xác nhận trạng thái mới.
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
            <CardDescription>{describeResultMessage(result)}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Key" value={result.key ?? normalizedKey} mono />
              <Info label="Loại key" value={keyKindLabel(result)} />
              <Info label="Tạo lúc" value={formatDateTime(result.created_at)} />
              <Info label="Hết hạn" value={result.expires_at ? formatDateTime(result.expires_at) : "Không giới hạn"} />
              <Info label="Thời gian còn lại" value={result.expires_at ? formatRemaining(result.remaining_seconds) : "Không giới hạn"} />
              <Info label="Lượt dùng / thiết bị" value={`${result.device_count ?? 0}/${result.max_devices ?? 0}`} />
              <Info label="Public reset" value={String(result.public_reset_count ?? 0)} />
              <Info label="Admin reset" value={String(result.admin_reset_count ?? 0)} />
              <Info label="Reset public" value={result.public_reset_disabled ? "Đã khóa bởi admin" : "Được phép"} />
              <Info
                label="Lần reset kế tiếp"
                value={result.next_reset_will_expire
                  ? "Sẽ hủy key"
                  : typeof result.next_reset_penalty_pct === "number"
                    ? `Trừ ${result.next_reset_penalty_pct}%`
                    : "Theo luật hiện tại"}
              />
            </div>

            {typeof result.penalty_pct === "number" && result.penalty_pct > 0 ? (
              <div className="rounded-xl border p-3 text-sm">
                Hệ thống vừa áp dụng mức trừ <span className="font-semibold">{result.penalty_pct}%</span>
                {typeof result.penalty_seconds === "number" ? `, tương đương ${formatRemaining(result.penalty_seconds)}.` : "."}
              </div>
            ) : null}

            {typeof result.devices_removed === "number" && result.devices_removed > 0 ? (
              <div className="rounded-xl border p-3 text-sm text-muted-foreground">
                Đã xóa/reset {result.devices_removed} lượt dùng hoặc thiết bị khỏi key này.
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
                  ? "Cảnh báo: nếu reset lần này, key có thể bị hủy về trạng thái hết hạn theo rule hiện tại."
                  : "Hệ thống sẽ reset lượt dùng/thiết bị của key này theo đúng loại key. Với một số key, thời gian còn lại có thể bị trừ theo chính sách server."}
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

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 break-all text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
