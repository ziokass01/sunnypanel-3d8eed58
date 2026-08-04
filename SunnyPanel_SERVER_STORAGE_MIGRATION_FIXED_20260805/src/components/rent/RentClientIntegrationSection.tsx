import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postFunction } from "@/lib/functions";
import { getErrorMessage } from "@/lib/error-message";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildRentClientIntegrationSql,
  buildRentClientWorkerConfig,
  normalizeRentClientCode,
  parseAllowedOrigins,
  stringifyAllowedOrigins,
} from "@/lib/rent-client-integration";

type ClientIntegrationRow = {
  id: string;
  account_id: string;
  client_code: string;
  label: string;
  allowed_origins: string[];
  rate_limit_per_minute: number;
  is_enabled: boolean;
  note: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function RentClientIntegrationSection(props: {
  authToken: string;
  accountId: string;
  username: string;
}) {
  const { authToken, accountId, username } = props;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [clientCode, setClientCode] = useState(normalizeRentClientCode(username));
  const [label, setLabel] = useState(`Web khách ${username}`);
  const [origins, setOrigins] = useState("https://mityangho.id.vn");
  const [rateLimit, setRateLimit] = useState("60");
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState("");

  const integrationQ = useQuery({
    queryKey: ["rent-admin", "client-integration-v2", accountId],
    enabled: !!authToken && !!accountId,
    retry: false,
    queryFn: async () => {
      const res = await postFunction<{ ok: true; integration: ClientIntegrationRow | null }>(
        "/admin-rent-integrations",
        { action: "get", account_id: accountId },
        { authToken },
      );
      return res.integration;
    },
  });

  useEffect(() => {
    const row = integrationQ.data;
    if (row) {
      setClientCode(row.client_code);
      setLabel(row.label);
      setOrigins(stringifyAllowedOrigins(row.allowed_origins));
      setRateLimit(String(row.rate_limit_per_minute));
      setEnabled(!!row.is_enabled);
      setNote(row.note ?? "");
      return;
    }
    if (!integrationQ.isLoading && !integrationQ.error) {
      setClientCode(normalizeRentClientCode(username));
      setLabel(`Web khách ${username}`);
      setOrigins("https://mityangho.id.vn");
      setRateLimit("60");
      setEnabled(true);
      setNote("");
    }
  }, [integrationQ.data, integrationQ.isLoading, integrationQ.error, username]);

  const saveM = useMutation({
    mutationFn: async () => {
      const res = await postFunction<{ ok: true; integration: ClientIntegrationRow }>(
        "/admin-rent-integrations",
        {
          action: "upsert",
          account_id: accountId,
          client_code: normalizeRentClientCode(clientCode || username),
          label: (label || `Web khách ${username}`).trim(),
          allowed_origins: parseAllowedOrigins(origins),
          rate_limit_per_minute: Math.max(10, Math.min(100000, parseInt(rateLimit || "60", 10) || 60)),
          is_enabled: enabled,
          note: note.trim() || null,
        },
        { authToken },
      );
      return res.integration;
    },
    onSuccess: () => {
      toast({ title: "Đã lưu setup khách" });
      qc.invalidateQueries({ queryKey: ["rent-admin", "client-integration-v2", accountId] });
    },
    onError: (error: any) => {
      toast({ title: "Lỗi setup khách", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const disableM = useMutation({
    mutationFn: async () => {
      await postFunction(
        "/admin-rent-integrations",
        { action: "disable", account_id: accountId },
        { authToken },
      );
    },
    onSuccess: () => {
      toast({ title: "Đã tắt tích hợp khách" });
      qc.invalidateQueries({ queryKey: ["rent-admin", "client-integration-v2", accountId] });
      setEnabled(false);
    },
    onError: (error: any) => {
      toast({ title: "Lỗi tắt tích hợp", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const schemaMissing = String(getErrorMessage(integrationQ.error as any) || "").includes("CLIENT_INTEGRATIONS_SCHEMA_MISSING");

  const draft = useMemo(() => ({
    clientCode: normalizeRentClientCode(clientCode || username),
    label: (label || `Web khách ${username}`).trim(),
    origins: parseAllowedOrigins(origins),
    rateLimit: Math.max(10, Math.min(100000, parseInt(rateLimit || "60", 10) || 60)),
    enabled,
    note,
  }), [clientCode, username, label, origins, rateLimit, enabled, note]);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="font-medium">(7) Setup khách / Tích hợp web khách</div>
      <p className="text-sm text-muted-foreground">
        Mỗi khách một cấu hình riêng, mỗi origin riêng. Khối này giúp tránh nhét secret vào HTML và tránh phải tạo file linh tinh cho từng khách.
      </p>

      {schemaMissing ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Chưa có schema <code>rent.client_integrations</code>. Hãy chạy migration trước.
        </div>
      ) : null}

      {!schemaMissing ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Client code</Label>
              <Input value={clientCode} onChange={(e) => setClientCode(normalizeRentClientCode(e.target.value))} placeholder="khach_a" />
            </div>
            <div className="space-y-2">
              <Label>Tên hiển thị</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Web khách A" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Allowed origins</Label>
              <Textarea value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder={"https://mityangho.id.vn\nhttps://a.mityangho.id.vn"} />
            </div>
            <div className="space-y-2">
              <Label>Rate limit / phút</Label>
              <Input value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} placeholder="60" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Bật tích hợp khách</div>
                <div className="text-sm text-muted-foreground">Tắt để chặn web khách gọi tiếp.</div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Ghi chú</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Khách A dùng subdomain a.mityangho.id.vn" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="soft" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
              {saveM.isPending ? "Đang lưu..." : (integrationQ.data ? "Cập nhật setup khách" : "Tạo setup khách")}
            </Button>
            <Button variant="outline" onClick={() => disableM.mutate()} disabled={disableM.isPending || !integrationQ.data}>
              {disableM.isPending ? "Đang tắt..." : "Tắt tích hợp"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const ok = await copyText(buildRentClientIntegrationSql(accountId, draft));
                toast({ title: ok ? "Đã copy SQL" : "Không copy được" });
              }}
            >
              Copy SQL
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const ok = await copyText(buildRentClientWorkerConfig({
                  clientCode: draft.clientCode,
                  origins: draft.origins,
                }));
                toast({ title: ok ? "Đã copy config worker" : "Không copy được" });
              }}
            >
              Copy config worker
            </Button>
          </div>

          <div className="grid gap-3">
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Checklist ngắn</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Không nhét <code>accounts.hmac_secret</code> vào HTML public.</li>
                <li>Chỉ để worker hoặc proxy giữ secret thật.</li>
                <li>Mỗi khách một <code>client_code</code> và allowed origins riêng.</li>
                <li>Khi cần khóa một khách, chỉ tắt integration thay vì phá cả hệ.</li>
              </ul>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs text-muted-foreground">SQL mẫu</div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{buildRentClientIntegrationSql(accountId, draft)}</pre>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Config worker mẫu</div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{buildRentClientWorkerConfig({
                clientCode: draft.clientCode,
                origins: draft.origins,
              })}</pre>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
