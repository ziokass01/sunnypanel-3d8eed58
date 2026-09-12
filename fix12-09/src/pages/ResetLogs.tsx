import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchResetActivities } from "@/features/reset-settings/reset-settings-api";

function badgeVariant(action: string) {
  const a = action.toUpperCase();
  if (a === "PUBLIC_RESET") return "secondary" as const;
  if (a === "RESET_DEVICES_PENALTY") return "destructive" as const;
  return "outline" as const;
}

export function ResetLogsPage() {
  const [action, setAction] = useState("all");
  const [query, setQuery] = useState("");

  const logsQuery = useQuery({
    queryKey: ["reset_logs_page"],
    queryFn: () => fetchResetActivities(200),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (logsQuery.data ?? []).filter((row) => {
      const actionOk = action === "all" ? true : row.action === action;
      const queryOk = !q
        ? true
        : row.license_key.toLowerCase().includes(q) ||
          JSON.stringify(row.detail ?? {}).toLowerCase().includes(q);
      return actionOk && queryOk;
    });
  }, [logsQuery.data, action, query]);

  const counters = useMemo(() => {
    const rows = logsQuery.data ?? [];
    return {
      total: rows.length,
      publicReset: rows.filter((r) => r.action === "PUBLIC_RESET").length,
      normalReset: rows.filter((r) => r.action === "RESET_DEVICES").length,
      penaltyReset: rows.filter((r) => r.action === "RESET_DEVICES_PENALTY").length,
    };
  }, [logsQuery.data]);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Reset Logs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Theo dõi toàn bộ reset gần đây để soi abuse, dò key và kiểm tra penalty.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-base">Tổng log</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{counters.total}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Public reset</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{counters.publicReset}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Reset thường</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{counters.normalReset}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Reset -20%</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{counters.penaltyReset}</CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
          <CardDescription>Lọc theo action hoặc tìm theo key / chi tiết log.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Tìm theo key hoặc detail..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="PUBLIC_RESET">PUBLIC_RESET</SelectItem>
              <SelectItem value="RESET_DEVICES">RESET_DEVICES</SelectItem>
              <SelectItem value="RESET_DEVICES_PENALTY">RESET_DEVICES_PENALTY</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nhật ký reset</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Penalty</TableHead>
                  <TableHead className="hidden md:table-cell">Devices removed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Đang tải reset logs...</TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Không có dòng nào khớp bộ lọc.</TableCell>
                  </TableRow>
                ) : rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">{new Date(row.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={badgeVariant(row.action)}>{row.action}</Badge></TableCell>
                    <TableCell className="font-mono text-xs md:text-sm break-all">{row.license_key}</TableCell>
                    <TableCell>{typeof row.detail?.penalty_pct === "number" ? `${row.detail.penalty_pct}%` : "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{row.detail?.devices_removed ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
