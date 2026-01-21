import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchDashboardStats, fetchVerifyCountsPerDay } from "@/features/dashboard/dashboard-api";

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ["dashboard_stats"],
    queryFn: fetchDashboardStats,
  });

  const chartQuery = useQuery({
    queryKey: ["verify_counts_per_day", { days: 14 }],
    queryFn: () => fetchVerifyCountsPerDay(14),
  });

  const lastUpdated = useMemo(() => new Date().toLocaleString(), [statsQuery.dataUpdatedAt, chartQuery.dataUpdatedAt]);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
      </header>

      {statsQuery.error ? <div className="text-sm text-destructive">{String(statsQuery.error)}</div> : null}
      {chartQuery.error ? <div className="text-sm text-destructive">{String(chartQuery.error)}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total keys" value={statsQuery.data?.total_licenses ?? 0} />
        <StatCard title="Active keys" value={statsQuery.data?.active_licenses ?? 0} />
        <StatCard title="Expired keys" value={statsQuery.data?.expired_licenses ?? 0} />
        <StatCard title="Blocked keys" value={statsQuery.data?.blocked_licenses ?? 0} />
        <StatCard title="Deleted keys" value={statsQuery.data?.deleted_licenses ?? 0} />
        <StatCard title="Total devices" value={statsQuery.data?.total_devices ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">VERIFY / day (last 14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (chartQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No data.</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartQuery.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="day" tickMargin={8} fontSize={12} />
                  <YAxis allowDecimals={false} width={32} fontSize={12} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
