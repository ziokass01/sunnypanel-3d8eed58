import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { getFunction } from "@/lib/functions";
import { supabase } from "@/integrations/supabase/client";

type RentStatus = {
  ok: true;
  tenant_id: string;
  username: string;
  active: boolean;
  subscription_expires_at: string | null;
  rotate_count: number;
  tenant_secret: string;
};

export default function RentIntegrationPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<RentStatus | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const verifyUrl = `${supabaseUrl}/functions/v1/rent-verify`;

  const load = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      const res = await getFunction<RentStatus>("rent-status", { authToken: token });
      setStatus(res);
    } catch (err: any) {
      toast({ title: "Không tải được dữ liệu", description: err?.message ?? String(err) });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Đã copy" });
    } catch {
      toast({ title: "Copy thất bại" });
    }
  };

  const curl = useMemo(() => {
    if (!status) return "";
    return `curl -X POST '${verifyUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-tenant-id: ${status.tenant_id}' \\
  -H 'x-tenant-secret: ${status.tenant_secret}' \\
  -d '{"key":"YOUR-KEY-HERE","device_id":"DEVICE-123"}'`;
  }, [status, verifyUrl]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Verify online
            {status?.active ? <Badge>Active</Badge> : <Badge variant="destructive">Expired</Badge>}
          </CardTitle>
          <CardDescription>
            Endpoint này sẽ check: chữ ký key (HMAC), key có tồn tại trong DB, trạng thái thu hồi, giới hạn thiết bị (nếu gửi device_id),
            và tenant còn hạn.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <div className="text-muted-foreground">URL</div>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all">{verifyUrl}</code>
              <Button variant="outline" size="sm" onClick={() => copy(verifyUrl)}>
                Copy
              </Button>
            </div>
          </div>

          {status && (
            <div className="text-sm">
              <div className="text-muted-foreground">Ví dụ gọi (curl)</div>
              <pre className="text-xs whitespace-pre-wrap rounded-md border p-3 bg-muted">
                {curl}
              </pre>
              <Button variant="outline" size="sm" onClick={() => copy(curl)}>
                Copy curl
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response codes</CardTitle>
          <CardDescription>Những mã trả về thường gặp</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>
            <b>ok: true</b> → hợp lệ
          </div>
          <div>
            <b>KEY_EXPIRED</b> → key hết hạn
          </div>
          <div>
            <b>REVOKED</b> → bị thu hồi
          </div>
          <div>
            <b>DEVICE_LIMIT</b> → vượt max thiết bị
          </div>
          <div>
            <b>TENANT_EXPIRED</b> → tenant hết hạn (tất cả key dừng)
          </div>
          <div>
            <b>UNAUTHORIZED</b> → sai tenant_secret
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ghi chú</CardTitle>
          <CardDescription>
            Nếu secret bị lộ, báo admin rotate. Rotate sẽ làm key cũ mất hiệu lực (để tránh bị leak).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Khuyến nghị: gọi verify từ server của bạn (không gọi trực tiếp từ client), hoặc nếu gọi từ client thì chấp nhận rủi ro lộ secret.
        </CardContent>
      </Card>
    </div>
  );
}
