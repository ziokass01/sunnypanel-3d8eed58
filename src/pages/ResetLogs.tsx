import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchResetActivities } from "@/features/reset-settings/reset-settings-api";

function actionVariant(action: string) {
  const a = String(action).toUpperCase();
  if (a === "PUBLIC_RESET") return "secondary" as const;
  if (a === "RESET_DEVICES_PENALTY") return "destructive" as const;
  return "outline" as const;
}

function actionIcon(action: string) {
  const a = String(action).toUpperCase();
  if (a === "PUBLIC_RESET") return <Activity className="h-4 w-4" />;
  if (a === "RESET_DEVICES_PENALTY") return <ShieldAlert className="h-4 w-4" />;
  return <ShieldCheck className="h-4 w-4" />;
}

export function ResetLogsPage() {
  const [actionFilter, setActionFilter] = useState<"all" | "PUBLIC_RESET" | "RESET_DEVICES" | "RESET_DEVICES_PENALTY">("all");
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["reset_activity_full"],
    queryFn: () => fetchResetActivities(300),
  });

  const rows = useMemo(() => {
    const text = q.trim().toUpperCase();
    return (query.data ?? []).filter((row) => {
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      if (!text) return true;
      const inKey = String(row.license_key ?? "").toUpperCase().includes(text);
      const inDetail = JSON.stringify(row.detail ?? {}).toUpperCase().includes(text);
      return inKey || inDetail;
    });
  }, [actionFilter, q, query.data]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const a = String(row.action).toUpperCase();
        if (a === "PUBLIC_RESET") acc.publicReset += 1;
        else if (a === "RESET_DEVICES_PENALTY") acc.penaltyReset += 1;
        else if (a === "RESET_DEVICES") acc.normalReset += 1;
        acc.total += 1;
        return acc;
      },
      { total: 0, publicReset: 0, normalReset: 0, penaltyReset: 0 },
    );
  }, [rows]);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reset Logs</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Theo dõi toàn bộ activity reset để soi abuse, check penalty và xem key nào bị reset nhiều.
          </p>
        </div>
        <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "Đang tải..." : "Làm mới"}
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tổng log</CardDescription>
            <CardTitle>{totals.total}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Sau khi áp dụng bộ lọc hiện tại.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Public reset</CardDescription>
            <CardTitle>{totals.publicReset}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">User reset trực tiếp ở trang public.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reset thường</CardDescription>
            <CardTitle>{totals.normalReset}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Admin/User xóa binding thiết bị không trừ thời gian.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Penalty reset</CardDescription>
            <CardTitle>{totals.penaltyReset}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Những lần reset có khấu trừ thời gian.</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
          <CardDescription>Lọc theo action hoặc key để đọc log đỡ rối như tơ vò.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo key hoặc detail..." />
          <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as any)}>
            <SelectTrigger>
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả action</SelectItem>
              <SelectItem value="PUBLIC_RESET">PUBLIC_RESET</SelectItem>
              <SelectItem value="RESET_DEVICES">RESET_DEVICES</SelectItem>
              <SelectItem value="RESET_DEVICES_PENALTY">RESET_DEVICES_PENALTY</SelectItem>
            </SelectContent>
          </Select>
          <div className="rounded-xl border px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            {rows.length === 0 ? <ShieldX className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {rows.length} dòng khớp bộ lọc hiện tại
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chi tiết log</CardTitle>
          <CardDescription>Mỗi dòng là một dấu chân reset để lần lại cho dễ.</CardDescription>
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
                  <TableHead className="hidden md:table-cell">Devices</TableHead>
                  <TableHead className="hidden lg:table-cell">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Đang tải reset logs...</TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Không có log nào khớp bộ lọc.</TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(row.action)} className="gap-1">
                          {actionIcon(row.action)}
                          {row.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs md:text-sm break-all">{row.license_key}</TableCell>
                      <TableCell>{typeof row.detail?.penalty_pct === "number" ? `${row.detail.penalty_pct}%` : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{row.detail?.devices_removed ?? "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[360px] truncate">{JSON.stringify(row.detail ?? {})}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
