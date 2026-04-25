import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Wrench, Smartphone } from "lucide-react";
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
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

function toIntLines(value: string) {
  return toCsvLines(value)
    .split(/\n+/)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item));
}

export function AdminServerAppRuntimePage() {
  const { appCode = "find-dumps" } = useParams();
  const meta = useMemo(() => getServerAppMeta(appCode), [appCode]);
  const { toast } = useToast();

  const runtimeQuery = useQuery({
    queryKey: ["server-app-runtime-controls-lite", appCode],
    queryFn: async () => {
      const [controlsRes, versionPolicyRes] = await Promise.all([
        supabase
          .from("server_app_runtime_controls")
          .select("app_code,runtime_enabled,catalog_enabled,redeem_enabled,consume_enabled,heartbeat_enabled,maintenance_notice,min_client_version,blocked_client_versions,session_idle_timeout_minutes,session_max_age_minutes")
          .eq("app_code", appCode)
          .maybeSingle(),
        supabase
          .from("server_app_version_policies")
          .select("*")
          .eq("app_code", appCode)
          .maybeSingle(),
      ]);
      if (controlsRes.error) throw controlsRes.error;
      if (versionPolicyRes.error) throw versionPolicyRes.error;
      return { controls: controlsRes.data as any, versionPolicy: versionPolicyRes.data as any };
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



  const [versionDraft, setVersionDraft] = useState<any>({
    enabled: true,
    force_update_enabled: true,
    min_version_name: "2.6",
    min_version_code: 8,
    latest_version_name: "2.6",
    latest_version_code: 8,
    update_url: "https://mityangho.id.vn/free",
    update_title: "Yêu cầu cập nhật",
    update_message: "Phiên bản Fake Lag bạn đang dùng đã bị chặn hoặc quá cũ. Vui lòng cập nhật để tiếp tục sử dụng.",
    allowed_package_names: "com.fakelag.cryhard8",
    allowed_signature_sha256: "2D:EB:73:EF:73:E9:B3:1C:84:C3:D1:00:07:6B:C4:D6:5C:8C:85:3A:AB:5E:D7:CD:1E:24:DE:51:A4:CD:CC:33",
    block_unknown_signature: false,
    blocked_version_names: "",
    blocked_version_codes: "",
    blocked_build_ids: "",
    notes: "",
  });
  useEffect(() => {
    if (!runtimeQuery.data) return;
    const controls = (runtimeQuery.data as any)?.controls;
    const versionPolicy = (runtimeQuery.data as any)?.versionPolicy;
    if (controls) {
      setDraft((prev: any) => ({
        ...prev,
        ...controls,
        blocked_client_versions: Array.isArray(controls?.blocked_client_versions)
          ? controls.blocked_client_versions.join("\n")
          : String(controls?.blocked_client_versions || ""),
      }));
    }
    if (versionPolicy) {
      setVersionDraft((prev: any) => ({
        ...prev,
        ...versionPolicy,
        allowed_package_names: Array.isArray(versionPolicy?.allowed_package_names) ? versionPolicy.allowed_package_names.join("\n") : String(versionPolicy?.allowed_package_names || ""),
        allowed_signature_sha256: Array.isArray(versionPolicy?.allowed_signature_sha256) ? versionPolicy.allowed_signature_sha256.join("\n") : String(versionPolicy?.allowed_signature_sha256 || ""),
        blocked_version_names: Array.isArray(versionPolicy?.blocked_version_names) ? versionPolicy.blocked_version_names.join("\n") : String(versionPolicy?.blocked_version_names || ""),
        blocked_version_codes: Array.isArray(versionPolicy?.blocked_version_codes) ? versionPolicy.blocked_version_codes.join("\n") : String(versionPolicy?.blocked_version_codes || ""),
        blocked_build_ids: Array.isArray(versionPolicy?.blocked_build_ids) ? versionPolicy.blocked_build_ids.join("\n") : String(versionPolicy?.blocked_build_ids || ""),
      }));
    }
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

      const versionPayload = {
        app_code: appCode,
        enabled: Boolean(versionDraft.enabled),
        force_update_enabled: Boolean(versionDraft.force_update_enabled),
        min_version_name: String(versionDraft.min_version_name || "").trim() || null,
        min_version_code: Number(versionDraft.min_version_code || 0),
        latest_version_name: String(versionDraft.latest_version_name || "").trim() || null,
        latest_version_code: Number(versionDraft.latest_version_code || 0),
        update_url: String(versionDraft.update_url || "").trim() || "https://mityangho.id.vn/free",
        update_title: String(versionDraft.update_title || "").trim() || "Yêu cầu cập nhật",
        update_message: String(versionDraft.update_message || "").trim() || "Phiên bản bạn đang dùng đã cũ. Vui lòng cập nhật để tiếp tục sử dụng.",
        allowed_package_names: toCsvLines(String(versionDraft.allowed_package_names || "")).split(/\n+/).filter(Boolean),
        allowed_signature_sha256: toCsvLines(String(versionDraft.allowed_signature_sha256 || "")).split(/\n+/).filter(Boolean).map((item) => item.replace(/[^0-9a-fA-F]/g, "").toUpperCase()).filter(Boolean),
        block_unknown_signature: Boolean(versionDraft.block_unknown_signature),
        require_signature_match: Boolean(versionDraft.block_unknown_signature),
        block_missing_identity: true,
        blocked_version_names: toCsvLines(String(versionDraft.blocked_version_names || "")).split(/\n+/).filter(Boolean),
        blocked_version_codes: toIntLines(String(versionDraft.blocked_version_codes || "")),
        blocked_build_ids: toCsvLines(String(versionDraft.blocked_build_ids || "")).split(/\n+/).filter(Boolean),
        notes: String(versionDraft.notes || "").trim() || null,
      };
      const versionWrite = await supabase.from("server_app_version_policies").upsert(versionPayload, { onConflict: "app_code" });
      if (versionWrite.error) throw versionWrite.error;
    },
    onSuccess: async () => {
      await runtimeQuery.refetch();
      toast({ title: "Đã lưu Runtime app", description: "Runtime và chính sách phiên bản đã được cập nhật." });
    },
    onError: (error: any) => {
      toast({ title: "Không lưu được Runtime app", description: error?.message || "Vui lòng kiểm tra bảng server_app_runtime_controls.", variant: "destructive" });
    },
  });

  if (appCode === "free-fire") {
    return (
      <section className="space-y-4">
        <Badge variant="secondary">Legacy runtime</Badge>
        <h1 className="text-2xl font-semibold">Free Fire không dùng runtime app-host</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Free Fire giữ nguyên tuyến admin / free-key hiện tại. Khu Runtime app ở app-host chỉ dành cho Find Dumps và các app mới về sau.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">Runtime app</Badge>
        <h1 className="text-2xl font-semibold">Runtime app cho {meta.label}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">Tab này chỉ giữ các công tắc vận hành thật: bật/tắt runtime, maintenance, min version, block build/version và timeout. Các phần Ví, Session, Giao dịch, Sự kiện đã chuyển sang Audit Log.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Runtime</div><div className="mt-2 text-2xl font-semibold">{draft.runtime_enabled ? "Bật" : "Tắt"}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Redeem</div><div className="mt-2 text-2xl font-semibold">{draft.redeem_enabled ? "Cho phép" : "Khóa"}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Phiên</div><div className="mt-2 text-2xl font-semibold">{Number(draft.session_idle_timeout_minutes || 0)} / {Number(draft.session_max_age_minutes || 0)} phút</div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Công tắc vận hành</CardTitle>
            <CardDescription>Bật/tắt đúng những gì liên quan runtime. Audit và theo dõi được tách riêng để màn hình gọn hơn.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ["runtime_enabled", "Bật runtime tổng"],
              ["catalog_enabled", "Bật catalog / danh mục"],
              ["redeem_enabled", "Cho phép redeem key"],
              ["consume_enabled", "Cho phép tiêu hao credit"],
              ["heartbeat_enabled", "Bật heartbeat / nhịp sống"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-2xl border px-4 py-3">
                <div className="text-sm font-medium">{label}</div>
                <Switch checked={Boolean(draft[key])} onCheckedChange={(checked) => setDraft((prev: any) => ({ ...prev, [key]: checked }))} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Bản vá và chặn phiên bản</CardTitle>
            <CardDescription>Block version/build ở đây để ép user cập nhật bản vá. Trường block nên lưu cả version hiển thị lẫn build identity ở backend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Min client version</div>
              <Input value={draft.min_client_version || ""} onChange={(e) => setDraft((prev: any) => ({ ...prev, min_client_version: e.target.value }))} placeholder="Ví dụ: 2.1.0" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Danh sách version / build bị chặn</div>
              <Textarea value={draft.blocked_client_versions || ""} onChange={(e) => setDraft((prev: any) => ({ ...prev, blocked_client_versions: e.target.value }))} rows={6} placeholder={"Ví dụ:\n2.0.1\nbuild:fd-2026-04-10-a"} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Maintenance notice</div>
              <Textarea value={draft.maintenance_notice || ""} onChange={(e) => setDraft((prev: any) => ({ ...prev, maintenance_notice: e.target.value }))} rows={4} placeholder="Nhập thông báo bảo trì hoặc thông tin ép cập nhật..." />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /> Version guard server-side</CardTitle>
          <CardDescription>
            Chính sách này dùng cho app Fake Lag gọi function <span className="font-mono">fake-lag-check</span>. Khi chặn bản cũ, app sẽ hiện popup bắt cập nhật. Không dựa vào mỗi version client tự khai báo: hãy set SHA-256 chữ ký release và bật chặn chữ ký lạ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
              <div><div className="text-sm font-medium">Bật version guard</div><div className="text-xs text-muted-foreground">Tắt mục này sẽ block theo policy disabled.</div></div>
              <Switch checked={Boolean(versionDraft.enabled)} onCheckedChange={(checked) => setVersionDraft((prev: any) => ({ ...prev, enabled: checked }))} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
              <div><div className="text-sm font-medium">Ép update bản cũ</div><div className="text-xs text-muted-foreground">Dựa trên min version name/code do server quản lý.</div></div>
              <Switch checked={Boolean(versionDraft.force_update_enabled)} onCheckedChange={(checked) => setVersionDraft((prev: any) => ({ ...prev, force_update_enabled: checked }))} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2"><div className="text-sm font-medium">Min version name</div><Input value={versionDraft.min_version_name || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, min_version_name: e.target.value }))} placeholder="1.0.0" /></div>
            <div className="space-y-2"><div className="text-sm font-medium">Min version code</div><Input type="number" value={versionDraft.min_version_code || 1} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, min_version_code: Number(e.target.value || 0) }))} min={1} /></div>
            <div className="space-y-2"><div className="text-sm font-medium">Latest version name</div><Input value={versionDraft.latest_version_name || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, latest_version_name: e.target.value }))} placeholder="2.6" /></div>
            <div className="space-y-2"><div className="text-sm font-medium">Latest version code</div><Input type="number" value={versionDraft.latest_version_code || 1} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, latest_version_code: Number(e.target.value || 0) }))} min={1} /></div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><div className="text-sm font-medium">Update URL</div><Input value={versionDraft.update_url || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, update_url: e.target.value }))} placeholder="https://mityangho.id.vn/free" /></div>
            <div className="space-y-2"><div className="text-sm font-medium">Tiêu đề popup</div><Input value={versionDraft.update_title || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, update_title: e.target.value }))} /></div>
          </div>
          <div className="space-y-2"><div className="text-sm font-medium">Nội dung popup update</div><Textarea rows={3} value={versionDraft.update_message || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, update_message: e.target.value }))} /></div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><div className="text-sm font-medium">Package name hợp lệ</div><Textarea rows={4} value={versionDraft.allowed_package_names || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, allowed_package_names: e.target.value }))} placeholder={"com.fakelag.cryhard8"} /></div>
            <div className="space-y-2"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium">SHA-256 chữ ký release hợp lệ</div><Switch checked={Boolean(versionDraft.block_unknown_signature)} onCheckedChange={(checked) => setVersionDraft((prev: any) => ({ ...prev, block_unknown_signature: checked }))} /></div><Textarea rows={4} value={versionDraft.allowed_signature_sha256 || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, allowed_signature_sha256: e.target.value }))} placeholder="Dán SHA-256 signing certificate release, mỗi dòng 1 hash" /><div className="text-xs text-muted-foreground">Bật switch sau khi đã nhập đúng chữ ký release. Nếu để trống và bật, app repack/chữ ký lạ sẽ bị chặn.</div></div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><div className="text-sm font-medium">Version name bị chặn</div><Textarea rows={5} value={versionDraft.blocked_version_names || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, blocked_version_names: e.target.value }))} placeholder={"1.0.0\n1.0.1"} /></div>
            <div className="space-y-2"><div className="text-sm font-medium">Version code bị chặn</div><Textarea rows={5} value={versionDraft.blocked_version_codes || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, blocked_version_codes: e.target.value }))} placeholder={"1\n2"} /></div>
            <div className="space-y-2"><div className="text-sm font-medium">Build ID bị chặn</div><Textarea rows={5} value={versionDraft.blocked_build_ids || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, blocked_build_ids: e.target.value }))} placeholder={"fl-2026-04-24-a"} /></div>
          </div>
          <div className="space-y-2"><div className="text-sm font-medium">Ghi chú nội bộ</div><Textarea rows={3} value={versionDraft.notes || ""} onChange={(e) => setVersionDraft((prev: any) => ({ ...prev, notes: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Timeout và tuổi thọ phiên</CardTitle>
          <CardDescription>Các giá trị này nên phản ánh đúng runtime thật để tránh session treo quá lâu hoặc dùng lại bản cũ.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Session idle timeout (phút)</div>
            <Input type="number" value={draft.session_idle_timeout_minutes || 30} onChange={(e) => setDraft((prev: any) => ({ ...prev, session_idle_timeout_minutes: Number(e.target.value || 0) }))} min={1} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Session max age (phút)</div>
            <Input type="number" value={draft.session_max_age_minutes || 720} onChange={(e) => setDraft((prev: any) => ({ ...prev, session_max_age_minutes: Number(e.target.value || 0) }))} min={1} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || runtimeQuery.isFetching}>Lưu Runtime app</Button>
      </div>
    </section>
  );
}
