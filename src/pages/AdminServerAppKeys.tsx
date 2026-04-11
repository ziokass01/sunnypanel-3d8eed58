import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, TicketPercent } from "lucide-react";
import { useParams } from "react-router-dom";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FIND_DUMPS_CREDITS, FIND_DUMPS_PACKAGES, formatCredit, getServerAppMeta } from "@/lib/serverAppPolicies";

function rewardModeForCredit(code: string) {
  return code === "credit-vip" ? "premium_credit" : "soft_credit";
}

function packageSeedRows(rows: any[] | null | undefined) {
  const map = new Map((rows || []).map((row: any) => [String(row.package_code || "").trim().toLowerCase(), row]));
  return FIND_DUMPS_PACKAGES.map((item) => {
    const hit = map.get(item.code);
    return {
      code: item.code,
      label: hit?.title || item.label,
      enabled: hit?.enabled ?? item.enabled,
      durationDays: Number(hit?.entitlement_days ?? item.defaultDays),
      oneTimeUse: item.oneTimeUse,
      resetDaily: item.resetDaily,
      maxRedemptions: 1,
      note: String(hit?.description || "Nhận xong là đồng hồ chạy ngay, hết hạn thì key cũng mất."),
    };
  });
}

function creditSeedRows(rows: any[] | null | undefined) {
  const map = new Map((rows || []).map((row: any) => [String(row.package_code || "").trim().toLowerCase(), row]));
  return FIND_DUMPS_CREDITS.map((item) => {
    const hit = map.get(item.code);
    return {
      code: item.code,
      label: hit?.title || item.label,
      enabled: hit?.enabled ?? true,
      amount: Number(item.walletKind === "vip" ? (hit?.premium_credit_amount ?? item.defaultAmount) : (hit?.soft_credit_amount ?? item.defaultAmount)),
      expiresHours: Number((hit?.entitlement_seconds ?? item.expiresHours * 3600) / 3600),
      maxRedemptions: 1,
      note: String(hit?.description || "Code nhận được chỉ dùng 1 lần và tự mất hiệu lực sau khi hết hạn."),
      walletKind: item.walletKind,
    };
  });
}

export function AdminServerAppKeysPage() {
  const { appCode = "find-dumps" } = useParams();
  const meta = useMemo(() => getServerAppMeta(appCode), [appCode]);
  const { toast } = useToast();
  const [issueKind, setIssueKind] = useState<"package" | "credit">("package");
  const [selectedCode, setSelectedCode] = useState<string>(FIND_DUMPS_PACKAGES[0].code);

  const rewardsQuery = useQuery({
    queryKey: ["server-app-keys-lite", appCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_app_reward_packages")
        .select("id,package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds")
        .eq("app_code", appCode)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    retry: false,
  });

  const [packageDrafts, setPackageDrafts] = useState<any[]>(packageSeedRows([]));
  const [creditDrafts, setCreditDrafts] = useState<any[]>(creditSeedRows([]));

  useEffect(() => {
    if (!rewardsQuery.data) return;
    setPackageDrafts(packageSeedRows(rewardsQuery.data));
    setCreditDrafts(creditSeedRows(rewardsQuery.data));
  }, [rewardsQuery.data]);

  useEffect(() => {
    setSelectedCode(issueKind === "package" ? packageDrafts[0]?.code || FIND_DUMPS_PACKAGES[0].code : creditDrafts[0]?.code || FIND_DUMPS_CREDITS[0].code);
  }, [issueKind, packageDrafts, creditDrafts]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = [
        ...packageDrafts.map((item, index) => ({
          app_code: appCode,
          package_code: item.code,
          title: item.label,
          description: item.note,
          enabled: Boolean(item.enabled),
          reward_mode: "plan",
          plan_code: item.code,
          entitlement_days: Number(item.durationDays || 0),
          entitlement_seconds: Number(item.durationDays || 0) * 86400,
          sort_order: (index + 1) * 10,
        })),
        ...creditDrafts.map((item, index) => ({
          app_code: appCode,
          package_code: item.code,
          title: item.label,
          description: item.note,
          enabled: Boolean(item.enabled),
          reward_mode: rewardModeForCredit(item.code),
          plan_code: null,
          soft_credit_amount: item.walletKind === "normal" ? Number(item.amount || 0) : 0,
          premium_credit_amount: item.walletKind === "vip" ? Number(item.amount || 0) : 0,
          entitlement_days: 0,
          entitlement_seconds: Number(item.expiresHours || 0) * 3600,
          sort_order: 100 + (index + 1) * 10,
        })),
      ];
      const { error } = await supabase.from("server_app_reward_packages").upsert(payload, { onConflict: "app_code,package_code" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await rewardsQuery.refetch();
      toast({ title: "Đã lưu Server key", description: "Package key và credit key của Find Dumps đã được cập nhật." });
    },
    onError: (error: any) => toast({ title: "Không lưu được Server key", description: error?.message || "Vui lòng kiểm tra bảng server_app_reward_packages.", variant: "destructive" }),
  });

  if (appCode === "free-fire") {
    return (
      <section className="space-y-4">
        <header className="space-y-2">
          <Badge variant="secondary">Legacy server key</Badge>
          <h1 className="text-2xl font-semibold">Free Fire giữ đường key cũ</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Free Fire vẫn dùng trang admin key hiện tại. Tại app-host chỉ giữ đường điều hướng ngắn gọn để không phá luồng đang chạy thật.</p>
        </header>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <div className="font-medium">Mở thẳng server key Free Fire</div>
              <div className="text-sm text-muted-foreground">Giữ nguyên get / gate / claim / reveal, reset key và JSON/log hiện có.</div>
            </div>
            <Button asChild><a href={meta.serverUrl}>Server</a></Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const selectedPackage = packageDrafts.find((item) => item.code === selectedCode) || packageDrafts[0];
  const selectedCredit = creditDrafts.find((item) => item.code === selectedCode) || creditDrafts[0];

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">Server key</Badge>
        <h1 className="text-2xl font-semibold">Server key cho {meta.label}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">Khu này tách hẳn khỏi Runtime và Audit Log. Package key, credit key, số lần dùng, thời hạn và cách bung lựa chọn ở trang free được quản lý riêng cho Find Dumps.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Package key</div><div className="mt-1 text-2xl font-semibold">{packageDrafts.length}</div></div><TicketPercent className="h-5 w-5 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Credit key</div><div className="mt-1 text-2xl font-semibold">{creditDrafts.length}</div></div><KeyRound className="h-5 w-5 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Rule lõi</div><div className="mt-1 text-2xl font-semibold">One-time + Auto-expire</div></div><ShieldCheck className="h-5 w-5 text-primary" /></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview hành vi ở trang free</CardTitle>
          <CardDescription>Khi chọn key Find Dumps ở trang free, user chỉ bung thêm lựa chọn package hoặc credit. Các ngày/giờ cụ thể được chốt sẵn ở server key, không bắt user nhập lại.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Loại key phát ra</div>
            <Select value={issueKind} onValueChange={(value) => setIssueKind(value === "credit" ? "credit" : "package")}> 
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="package">Gói thời hạn</SelectItem>
                <SelectItem value="credit">Code credit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Mục bung thêm ở /free</div>
            <Select value={selectedCode} onValueChange={setSelectedCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(issueKind === "package" ? packageDrafts : creditDrafts).map((item) => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground md:col-span-2">
            {issueKind === "package" ? (
              <>
                User chỉ cần chọn <span className="font-medium text-foreground">{selectedPackage?.label}</span>. Ô chỉnh ngày/giờ không hiện ở /free vì gói này đã được chốt từ server key với thời hạn <span className="font-medium text-foreground">{selectedPackage?.durationDays} ngày</span>, dùng <span className="font-medium text-foreground">{selectedPackage?.maxRedemptions} lần</span> và đếm ngược từ lúc nhận key.
              </>
            ) : (
              <>
                User chỉ cần chọn <span className="font-medium text-foreground">{selectedCredit?.label}</span>. Hệ thống tự hiểu đây là code cho <span className="font-medium text-foreground">{selectedCredit?.walletKind === "vip" ? "ví VIP" : "ví thường"}</span>, amount <span className="font-medium text-foreground">{formatCredit(selectedCredit?.amount || 0)}</span> và hết hạn sau <span className="font-medium text-foreground">{selectedCredit?.expiresHours} giờ</span>.
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Accordion type="multiple" className="space-y-3">
        <AccordionItem value="packages" className="rounded-2xl border px-5">
          <AccordionTrigger>Package key: classic / go / plus / pro</AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            {packageDrafts.map((item, index) => (
              <div key={item.code} className="rounded-2xl border bg-muted/10 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">Key gói dùng một lần, hạn dùng chạy từ lúc nhận và tự mất khi hết hạn.</div>
                  </div>
                  <Switch checked={Boolean(item.enabled)} onCheckedChange={(checked) => setPackageDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: checked } : row))} />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2"><div className="text-sm font-medium">Tên hiển thị</div><Input value={item.label} onChange={(e) => setPackageDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, label: e.target.value } : row))} /></div>
                  <div className="space-y-2"><div className="text-sm font-medium">Số ngày</div><Input type="number" value={item.durationDays} onChange={(e) => setPackageDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, durationDays: Number(e.target.value || 0) } : row))} min={1} /></div>
                  <div className="space-y-2"><div className="text-sm font-medium">Số lần dùng</div><Input type="number" value={item.maxRedemptions} onChange={(e) => setPackageDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, maxRedemptions: Number(e.target.value || 1) } : row))} min={1} /></div>
                  <div className="space-y-2"><div className="text-sm font-medium">Rule</div><Input value={item.oneTimeUse ? "One-time + auto-expire" : "Reusable"} readOnly /></div>
                </div>
                <div className="space-y-2"><div className="text-sm font-medium">Ghi chú server</div><Input value={item.note} onChange={(e) => setPackageDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, note: e.target.value } : row))} /></div>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="credits" className="rounded-2xl border px-5">
          <AccordionTrigger>Credit key: credit thường / credit VIP</AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            {creditDrafts.map((item, index) => (
              <div key={item.code} className="rounded-2xl border bg-muted/10 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">Code credit có hạn dùng riêng và chỉ redeem được 1 lần.</div>
                  </div>
                  <Switch checked={Boolean(item.enabled)} onCheckedChange={(checked) => setCreditDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: checked } : row))} />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2"><div className="text-sm font-medium">Tên hiển thị</div><Input value={item.label} onChange={(e) => setCreditDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, label: e.target.value } : row))} /></div>
                  <div className="space-y-2"><div className="text-sm font-medium">Số credit</div><Input type="number" step="0.1" value={item.amount} onChange={(e) => setCreditDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, amount: Number(e.target.value || 0) } : row))} /></div>
                  <div className="space-y-2"><div className="text-sm font-medium">Hết hạn sau (giờ)</div><Input type="number" value={item.expiresHours} onChange={(e) => setCreditDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, expiresHours: Number(e.target.value || 0) } : row))} min={1} /></div>
                  <div className="space-y-2"><div className="text-sm font-medium">Ví áp dụng</div><Input value={item.walletKind === "vip" ? "VIP" : "Thường"} readOnly /></div>
                </div>
                <div className="space-y-2"><div className="text-sm font-medium">Ghi chú server</div><Input value={item.note} onChange={(e) => setCreditDrafts((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, note: e.target.value } : row))} /></div>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || rewardsQuery.isFetching}>Lưu Server key</Button>
      </div>
    </section>
  );
}
