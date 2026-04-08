import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postFunction } from "@/lib/functions";
import { getErrorMessage } from "@/lib/error-message";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RentCreateClientSetupFields, type RentCreateClientSetupState } from "@/components/rent/RentCreateClientSetupFields";
import {
  buildRentClientIntegrationSql,
  buildRentClientWorkerConfig,
  normalizeRentClientCode,
  parseAllowedOrigins,
} from "@/lib/rent-client-integration";

type RentAccount = {
  id: string;
  username: string;
  created_at: string;
  activated_at: string | null;
  expires_at: string | null;
  max_devices: number;
  is_disabled: boolean;
  hmac_secret: string;
  note: string | null;
};

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

const defaultSetupState = (): RentCreateClientSetupState => ({
  enabled: false,
  clientCode: "",
  label: "",
  origins: "https://mityangho.id.vn",
  rateLimit: "60",
  note: "",
});

export function RentCreateUserWithSetupCard(props: {
  authToken: string;
  onCreated?: (user: RentAccount, integration?: ClientIntegrationRow | null) => void;
}) {
  const { authToken, onCreated } = props;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hmacSecret, setHmacSecret] = useState("");
  const [maxDevices, setMaxDevices] = useState("1");
  const [note, setNote] = useState("");
  const [setup, setSetup] = useState<RentCreateClientSetupState>(defaultSetupState());
  const [lastGenHmac, setLastGenHmac] = useState<string | null>(null);
  const [lastSetup, setLastSetup] = useState<ClientIntegrationRow | null>(null);

  const createM = useMutation({
    mutationFn: async () => {
      const maxDevicesValue = Math.max(1, Math.min(20, parseInt(maxDevices || "1", 10) || 1));
      const res = await postFunction<{ ok: true; user: RentAccount; generated_hmac?: string }>(
        "/admin-rent",
        {
          action: "create_user",
          username: username.trim(),
          password,
          hmac_secret: hmacSecret.trim() || null,
          max_devices: maxDevicesValue,
          note: note.trim() || null,
        },
        { authToken },
      );

      let integration: ClientIntegrationRow | null = null;
      if (setup.enabled) {
        const integrationRes = await postFunction<{ ok: true; integration: ClientIntegrationRow }>(
          "/admin-rent-integrations",
          {
            action: "upsert",
            account_id: res.user.id,
            client_code: normalizeRentClientCode(setup.clientCode || username),
            label: (setup.label || `Web khách ${username}`).trim(),
            allowed_origins: parseAllowedOrigins(setup.origins),
            rate_limit_per_minute: Math.max(10, Math.min(100000, parseInt(setup.rateLimit || "60", 10) || 60)),
            is_enabled: true,
            note: setup.note.trim() || null,
          },
          { authToken },
        );
        integration = integrationRes.integration;
      }

      return { ...res, integration };
    },
    onSuccess: (res) => {
      setLastGenHmac(res.generated_hmac ?? null);
      setLastSetup(res.integration ?? null);
      toast({ title: "Tạo tài khoản thuê thành công" });
      setUsername("");
      setPassword("");
      setHmacSecret("");
      setMaxDevices("1");
      setNote("");
      setSetup(defaultSetupState());
      qc.invalidateQueries({ queryKey: ["rent-admin", "users"] });
      onCreated?.(res.user, res.integration ?? null);
    },
    onError: (error: any) => {
      toast({ title: "Lỗi tạo user", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tạo tài khoản thuê</CardTitle>
        <CardDescription>
          Tạo username, password, HMAC secret riêng cho user domain. Có thể bật luôn setup khách để sau đó chỉ việc copy cấu hình chạy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user123" />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>HMAC secret (tuỳ chọn)</Label>
            <Input value={hmacSecret} onChange={(e) => setHmacSecret(e.target.value)} placeholder="để trống = random" />
          </div>
          <div className="space-y-2">
            <Label>Max devices</Label>
            <Input value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} placeholder="1" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Note (tuỳ chọn)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú cho tài khoản thuê" />
          </div>
        </div>

        <RentCreateClientSetupFields username={username} value={setup} onChange={setSetup} />

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => createM.mutate()}
            disabled={createM.isPending || !authToken || !username.trim() || !password.trim()}
          >
            {createM.isPending ? "Đang tạo..." : "Tạo user thuê"}
          </Button>
        </div>

        {lastGenHmac ? (
          <div className="rounded-lg border p-3 text-sm">
            <div className="text-xs text-muted-foreground">HMAC vừa random</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="max-w-full break-all rounded bg-muted px-2 py-1">{lastGenHmac}</code>
              <Button
                size="sm"
                variant="soft"
                onClick={async () => {
                  const ok = await copyText(lastGenHmac);
                  toast({ title: ok ? "Đã copy" : "Không copy được" });
                }}
              >
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLastGenHmac(null)}>Ẩn</Button>
            </div>
          </div>
        ) : null}

        {lastSetup ? (
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-medium">Setup khách vừa tạo</div>
            <div className="mt-2 text-muted-foreground">Client code: <span className="font-mono">{lastSetup.client_code}</span></div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="soft"
                onClick={async () => {
                  const ok = await copyText(buildRentClientIntegrationSql(lastSetup.account_id, {
                    clientCode: lastSetup.client_code,
                    label: lastSetup.label,
                    origins: lastSetup.allowed_origins,
                    rateLimit: lastSetup.rate_limit_per_minute,
                    enabled: lastSetup.is_enabled,
                    note: lastSetup.note ?? "",
                  }));
                  toast({ title: ok ? "Đã copy SQL" : "Không copy được" });
                }}
              >
                Copy SQL
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const ok = await copyText(buildRentClientWorkerConfig({
                    clientCode: lastSetup.client_code,
                    origins: lastSetup.allowed_origins,
                  }));
                  toast({ title: ok ? "Đã copy config" : "Không copy được" });
                }}
              >
                Copy config worker
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLastSetup(null)}>Ẩn</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
