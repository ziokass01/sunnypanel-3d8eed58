import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile/TurnstileWidget";
import { postFunction } from "@/lib/functions";

type ResetKeyPayload = {
  ok: boolean;
  msg: string;
  key?: string;
  key_kind?: string;
  created_at?: string | null;
  expires_at?: string | null;
  remaining_seconds?: number | null;
  status?: string;
  device_count?: number;
  max_devices?: number;
  admin_reset_count?: number;
  public_reset_count?: number;
  penalty_pct?: number;
  penalty_seconds?: number;
  devices_removed?: number;
  reset_enabled?: boolean;
  disabled_message?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Không giới hạn";
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

  const parts = [];
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

export function ResetKeyPage() {
  const [key, setKey] = useState("");
  const [loadingAction, setLoadingAction] = useState<"check" | "reset" | null>(null);
  const [result, setResult] = useState<ResetKeyPayload | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const normalizedKey = useMemo(() => key.trim().toUpperCase(), [key]);
  const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim();

  async function runAction(action: "check" | "reset") {
    if (!normalizedKey) return;
    setLoadingAction(action);

    try {
      const res = await postFunction<ResetKeyPayload>("/reset-key", {
        action,
        key: normalizedKey,
        turnstile_token: turnstileToken,
      });
      setResult(res);
    } catch (e: any) {
      setResult({
        ok: false,
        msg: String(e?.message ?? "Có lỗi xảy ra"),
      });
    } finally {
      setLoadingAction(null);
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
              onClick={() => runAction("check")}
            >
              {loadingAction === "check" ? "Đang kiểm tra..." : "Check key"}
            </Button>

            <Button
              disabled={!normalizedKey || loadingAction !== null}
              onClick={() => runAction("reset")}
            >
              {loadingAction === "reset" ? "Đang reset..." : "Reset key"}
            </Button>
          </div>

          {turnstileSiteKey ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Turnstile sẽ được dùng khi admin bật chế độ chống spam ở Reset Settings.
              </div>
              <TurnstileWidget siteKey={turnstileSiteKey} onTokenChange={setTurnstileToken} />
            </div>
          ) : (
            <div className="rounded-xl border p-3 text-xs text-muted-foreground">
              Frontend chưa có Turnstile site key. Bạn vẫn dùng được Reset Key khi admin chưa bật yêu cầu Turnstile.
            </div>
          )}

          {result?.msg === "TURNSTILE_REQUIRED" || result?.msg === "TURNSTILE_FAILED" ? (
            <div className="rounded-xl border p-3 text-sm text-destructive">
              Turnstile đang được yêu cầu. Hãy hoàn thành widget xác minh rồi thử lại.
            </div>
          ) : null}

          {result?.reset_enabled === false ? (
            <div className="rounded-xl border p-3 text-sm text-muted-foreground">
              {result.disabled_message || "Tính năng reset đang tạm đóng."}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <Card className="rounded-2xl">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Trạng thái key</CardTitle>
              <Badge variant={statusVariant(result.status)}>{result.status ?? result.msg}</Badge>
            </div>
            <CardDescription>{result.ok ? "Đã lấy thông tin mới nhất từ hệ thống." : result.msg}</CardDescription>
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
                <div className="mt-1 text-sm">{formatDateTime(result.expires_at)}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Thời gian còn lại</div>
                <div className="mt-1 text-sm">{formatRemaining(result.remaining_seconds)}</div>
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
            </div>

            {typeof result.penalty_pct === "number" ? (
              <div className="rounded-xl border p-3 text-sm">
                Hệ thống vừa áp dụng mức trừ <span className="font-semibold">{result.penalty_pct}%</span>
                {typeof result.penalty_seconds === "number" ? `, tương đương ${formatRemaining(result.penalty_seconds)}.` : "."}
              </div>
            ) : null}

            {typeof result.devices_removed === "number" ? (
              <div className="rounded-xl border p-3 text-sm text-muted-foreground">
                Đã xóa {result.devices_removed} thiết bị khỏi key này.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
