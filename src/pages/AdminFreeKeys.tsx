import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SessionRow = {
  session_id: string;
  created_at: string;
  expires_at: string;
  status: string;
  ip_hash: string;
  fingerprint_hash: string;
  reveal_count: number;
  closed_at: string | null;
  last_error: string | null;
};

type IssueRow = {
  issue_id: string;
  created_at: string;
  expires_at: string;
  license_id: string;
  key_mask: string;
  session_id: string;
  ip_hash: string;
  fingerprint_hash: string;
  ua_hash: string;
};

export function AdminFreeKeysPage() {
  const [status, setStatus] = useState<string>("all");
  const [ipHash, setIpHash] = useState("");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));

  const range = useMemo(() => {
    // day in YYYY-MM-DD
    const from = new Date(`${day}T00:00:00.000Z`).toISOString();
    const to = new Date(`${day}T23:59:59.999Z`).toISOString();
    return { from, to };
  }, [day]);

  const sessionsQuery = useQuery({
    queryKey: ["free-sessions", range.from, range.to, status, ipHash],
    queryFn: async () => {
      let q = supabase
        .from("licenses_free_sessions")
        .select(
          "session_id,created_at,expires_at,status,ip_hash,fingerprint_hash,reveal_count,closed_at,last_error",
        )
        .gte("created_at", range.from)
        .lte("created_at", range.to)
        .order("created_at", { ascending: false })
        .limit(200);

      if (status !== "all") q = q.eq("status", status);
      if (ipHash.trim()) q = q.eq("ip_hash", ipHash.trim());

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const issuesQuery = useQuery({
    queryKey: ["free-issues", range.from, range.to, ipHash],
    queryFn: async () => {
      let q = supabase
        .from("licenses_free_issues")
        .select(
          "issue_id,created_at,expires_at,license_id,key_mask,session_id,ip_hash,fingerprint_hash,ua_hash",
        )
        .gte("created_at", range.from)
        .lte("created_at", range.to)
        .order("created_at", { ascending: false })
        .limit(200);

      if (ipHash.trim()) q = q.eq("ip_hash", ipHash.trim());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as IssueRow[];
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Free keys</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <div className="text-sm font-medium">Day (UTC)</div>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Status</div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="init">init</SelectItem>
                <SelectItem value="gate_returned">gate_returned</SelectItem>
                <SelectItem value="revealed">revealed</SelectItem>
                <SelectItem value="closed">closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">IP hash</div>
            <Input value={ipHash} onChange={(e) => setIpHash(e.target.value)} placeholder="sha256(ip)" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Sessions</CardTitle>
          <Button variant="secondary" onClick={() => sessionsQuery.refetch()} disabled={sessionsQuery.isFetching}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reveal</TableHead>
                <TableHead>IP hash</TableHead>
                <TableHead>FP hash</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sessionsQuery.data ?? []).map((r) => (
                <TableRow key={r.session_id}>
                  <TableCell className="whitespace-nowrap text-xs">{r.created_at}</TableCell>
                  <TableCell className="text-xs">{r.status}</TableCell>
                  <TableCell className="text-xs">{r.reveal_count}</TableCell>
                  <TableCell className="max-w-[240px] truncate font-mono text-xs">{r.ip_hash}</TableCell>
                  <TableCell className="max-w-[240px] truncate font-mono text-xs">{r.fingerprint_hash}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs">{r.last_error ?? ""}</TableCell>
                </TableRow>
              ))}
              {!sessionsQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No sessions
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Issues (masked)</CardTitle>
          <Button variant="secondary" onClick={() => issuesQuery.refetch()} disabled={issuesQuery.isFetching}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Key mask</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>IP hash</TableHead>
                <TableHead>FP hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(issuesQuery.data ?? []).map((r) => (
                <TableRow key={r.issue_id}>
                  <TableCell className="whitespace-nowrap text-xs">{r.created_at}</TableCell>
                  <TableCell className="font-mono text-xs">{r.key_mask}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{r.expires_at}</TableCell>
                  <TableCell className="max-w-[240px] truncate font-mono text-xs">{r.ip_hash}</TableCell>
                  <TableCell className="max-w-[240px] truncate font-mono text-xs">{r.fingerprint_hash}</TableCell>
                </TableRow>
              ))}
              {!issuesQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No issues
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
