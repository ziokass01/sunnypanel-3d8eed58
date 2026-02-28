import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { getFunction, postFunction } from "@/lib/functions";
import { useAuth } from "@/auth/AuthProvider";

type KeyRow = {
  id: string;
  key_last4: string;
  expires_at: string;
  expires_unix: number;
  max_devices: number;
  revoked_at: string | null;
  created_at: string;
  note: string | null;
};

export default function RentKeysPage() {
  const { toast } = useToast();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [days, setDays] = useState("30");
  const [maxDevices, setMaxDevices] = useState("1");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await getFunction<{ ok: true; keys: KeyRow[] }>("rent-list-keys", { authToken: token });
      setKeys(res.keys ?? []);
    } catch (err: any) {
      toast({ title: "Không tải được danh sách key", description: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const now = Date.now();

  const onCreate = async () => {
    const d = Math.max(1, parseInt(days || "0", 10));
    const md = Math.max(1, parseInt(maxDevices || "1", 10));
    const duration_seconds = d * 24 * 3600;

    setCreating(true);
    try {
      if (!token) {
        toast({ title: "Chưa đăng nhập", description: "Vui lòng đăng nhập lại." });
        return;
      }
      const res = await postFunction<{ ok: boolean; key?: string; expires_at?: string; msg?: string; code?: string }>(
        "rent-generate-key",
        { duration_seconds, max_devices: md, note: note.trim() ? note.trim() : undefined },
        { authToken: token },
      );

      if (!res.ok) {
        toast({ title: "Tạo key thất bại", description: res.msg ?? res.code ?? "Lỗi" });
        return;
      }

      if (res.key) {
        await navigator.clipboard.writeText(res.key);
        toast({
          title: "Đã tạo key (đã copy)",
          description: `Key: ${res.key}`,
        });
      }

      setNote("");
      await refresh();
    } catch (err: any) {
      toast({ title: "Lỗi", description: err?.message ?? String(err) });
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (id: string) => {
    try {
      if (!token) {
        toast({ title: "Chưa đăng nhập", description: "Vui lòng đăng nhập lại." });
        return;
      }
      const res = await postFunction<{ ok: boolean; msg?: string; code?: string }>("rent-revoke-key", { id }, { authToken: token });
      if (!res.ok) {
        toast({ title: "Thu hồi thất bại", description: res.msg ?? res.code ?? "Lỗi" });
        return;
      }
      toast({ title: "Đã thu hồi" });
      await refresh();
    } catch (err: any) {
      toast({ title: "Lỗi", description: err?.message ?? String(err) });
    }
  };

  const sorted = useMemo(() => keys, [keys]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Tạo key khách</CardTitle>
          <CardDescription>Tạo xong sẽ tự copy key. Lưu lại ngay (chỉ hiện 1 lần).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <div className="text-sm">Số ngày</div>
            <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <div className="text-sm">Max thiết bị</div>
            <Input value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <div className="text-sm">Ghi chú (tuỳ chọn)</div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: khách A" />
          </div>
          <div className="md:col-span-4">
            <Button onClick={onCreate} disabled={creating}>
              {creating ? "Đang tạo…" : "Tạo key"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách key</CardTitle>
          <CardDescription>Tối đa 200 key gần nhất.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Đang tải…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Hết hạn</TableHead>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((k) => {
                  const expMs = Date.parse(k.expires_at);
                  const expired = Number.isFinite(expMs) && expMs < now;
                  const revoked = !!k.revoked_at;
                  return (
                    <TableRow key={k.id}>
                      <TableCell>
                        <div className="font-mono text-xs">****-****-****-****-****-****-****-{k.key_last4}</div>
                        {k.note ? <div className="text-xs text-muted-foreground">{k.note}</div> : null}
                      </TableCell>
                      <TableCell className="text-sm">{new Date(expMs).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{k.max_devices}</TableCell>
                      <TableCell>
                        {revoked ? (
                          <Badge variant="destructive">Đã thu hồi</Badge>
                        ) : expired ? (
                          <Badge variant="secondary">Hết hạn</Badge>
                        ) : (
                          <Badge>OK</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" disabled={revoked} onClick={() => onRevoke(k.id)}>
                          Thu hồi
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Chưa có key nào.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
