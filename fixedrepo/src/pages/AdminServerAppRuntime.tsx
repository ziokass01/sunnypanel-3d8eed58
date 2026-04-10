import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Wrench } from "lucide-react";
import { useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getServerAppMeta } from "@/lib/serverAppPolicies";

function toCsvLines(value: string) {
  return value
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

export function AdminServerAppRuntimePage() {
  const { appCode = "find-dumps" } = useParams();
  const meta = useMemo(() => getServerAppMeta(appCode), [appCode]);
  const { toast } = useToast();

  const runtimeQuery = useQuery({
    queryKey: ["server-app-runtime-controls-lite", appCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_app_runtime_controls")
        .select("app_code,runtime_enabled,catalog_enabled,redeem_enabled,consume_enabled,heartbeat_enabled,maintenance_notice,min_client_version,blocked_client_versions,session_idle_timeout_minutes,session_max_age_minutes")
        .eq("app_code", appCode)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });

  const [draft, setDraft] = useState<any>({
    runtime_enabled: true,
    catalog_enabled: true,
    redeem_enabled: true,
    consume_enabled: true,
    heartbeat_enabled: true,
    maintenance_notice: "",
    min_client_version: "",
    blocked_client_versions: "",
    session_idle_timeout_minutes: 30,
    session_max_age_minutes: 720,
  });

  useEffect(() => {
    if (!runtimeQuery.data) return;
    const next = runtimeQuery.data as any;
    setDraft((prev: any) => ({
      ...prev,
      ...next,
      blocked_client_versions: Array.isArray(next?.blocked_client_versions)
        ? next.blocked_client_versions.join("\n")
        : String(next?.blocked_client_versions || ""),
    }));
  }, [runtimeQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        app_code: appCode,
        runtime_enabled: Boolean(draft.runtime_enabled),
        catalog_enabled: Boolean(draft.catalog_enabled),
        redeem_enabled: Boolean(draft.redeem_enabled),
        consume_enabled: Boolean(draft.consume_enabled),
        heartbeat_enabled: Boolean(draft.heartbeat_enabled),
        maintenance_notice: String(draft.maintenance_notice || "").trim() || null,
        min_client_version: String(draft.min_client_version || "").trim() || null,
        blocked_client_versions: toCsvLines(String(draft.blocked_client_versions || "")).split(/\n+/).filter(Boolean),
        session_idle_timeout_minutes: Number(draft.session_idle_timeout_minutes || 30),
        session_max_age_minutes: Number(draft.session_max_age_minutes || 720),
      };
      const { error } = await supabase.from("server_app_runtime_controls").upsert(payload, { onConflict: "app_code" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await runtimeQuery.refetch();
      toast({ title: "Đã lưu Runtime app", description: "Các công tắc vận hành đã được cập nhật." });
    },
    onError: (error: any) => {
      toast({
        title: "Không lưu được Runtime app",
        description: error?.message || "Vui lòng kiểm tra bảng server_app_runtime_controls.",
        variant: "destructive",
      });
    },
  });

  if (appCode === "free-fire") {
    return (
      <section className="space-y-4">
        <Badge variant="secondary">Legacy runtime</Badge>
        <h1 className="text-2xl font-semibold">Free Fire không dùng runtime app-host</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Free Fire giữ nguyên tuyến admin / free-key hiện tại. Khu Runtime app ở app-host chỉ dành cho Find Dumps và các app mới về sau.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <Badge variant="outline">Runtime app</Badge>
        <h1 className="text-2xl font-semibold">{meta.name} · Runtime app</h1>
        <p className="text-sm text-muted-foreground">
          Chỉ giữ phần điều khiển vận hành thật. Những khối theo dõi như ví, session, giao dịch và sự kiện đã được chuyển sang Audit Log.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Công tắc runtime</CardTitle>
            <CardDescription>Bật/tắt các đường xử lý chính của app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ["runtime_enabled", "Runtime tổng"],
              ["catalog_enabled", "Catalog"],
              ["redeem_enabled", "Redeem"],
              ["consume_enabled", "Consume"],
              ["heartbeat_enabled", "Heartbeat"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">Điều khiển nhánh {label.toLowerCase()}.</div>
                </div>
                <Switch checked={Boolean(draft[key])} onCheckedChange={(checked) => setDraft((prev: any) => ({ ...prev, [key]: checked }))} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Bản vá và chặn phiên bản</CardTitle>
            <CardDescription>Block version/build ở đây để ép user cập nhật bản vá. Nên lưu cả version hiển thị lẫn build identity ở backend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Min client version</div>
              <Input value={draft.min_client_version || ""} onChange={(e) => setDraft((prev: any) => ({ ...prev, min_client_version: e.target.value }))} placeholder="Ví dụ: 2.1.0" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Danh sách version / build bị chặn</div>
              <Textarea
                value={draft.blocked_client_versions || ""}
                onChange={(e) => setDraft((prev: any) => ({ ...prev, blocked_client_versions: e.target.value }))}
                rows={6}
                placeholder={"Ví dụ:\n2.0.1\nbuild:fd-2026-04-10-a"}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Maintenance notice</div>
              <Textarea value={draft.maintenance_notice || ""} onChange={(e) => setDraft((prev: any) => ({ ...prev, maintenance_notice: e.target.value }))} rows={4} placeholder="Nhập thông báo bảo trì hoặc thông tin ép cập nhật..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Timeout và tuổi thọ phiên</CardTitle>
            <CardDescription>Giới hạn thời gian idle và tuổi thọ tối đa của session runtime.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Session idle timeout (phút)</div>
              <Input type="number" value={draft.session_idle_timeout_minutes ?? 30} onChange={(e) => setDraft((prev: any) => ({ ...prev, session_idle_timeout_minutes: Number(e.target.value || 0) }))} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Session max age (phút)</div>
              <Input type="number" value={draft.session_max_age_minutes ?? 720} onChange={(e) => setDraft((prev: any) => ({ ...prev, session_max_age_minutes: Number(e.target.value || 0) }))} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || runtimeQuery.isLoading}>
          {saveMutation.isPending ? "Đang lưu..." : "Lưu Runtime app"}
        </Button>
      </div>
    </section>
  );
}

export default AdminServerAppRuntimePage;
