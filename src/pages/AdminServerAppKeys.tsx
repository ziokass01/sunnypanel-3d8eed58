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
  return String(code || "").toLowerCase().includes("vip") ? "premium_credit" : "soft_credit";
}

const DEFAULT_FIND_DUMPS_PACKAGE_KEY_ROWS = [
  { code: "fd_package", label: "Find Dumps Go 3 ngày", duration_seconds: 3 * 86400, kind: "day", value: 3, sort_order: 302, enabled: true, app_code: "find-dumps", app_label: "Find Dumps", key_signature: "SUNNY", allow_reset: false, free_selection_mode: "package", free_selection_expand: true, default_package_code: "go", default_credit_code: null, default_wallet_kind: null },
  { code: "fdd7", label: "Find Dumps Go 7 ngày", duration_seconds: 7 * 86400, kind: "day", value: 7, sort_order: 303, enabled: true, app_code: "find-dumps", app_label: "Find Dumps", key_signature: "SUNNY", allow_reset: false, free_selection_mode: "package", free_selection_expand: true, default_package_code: "go", default_credit_code: null, default_wallet_kind: null },
  { code: "fdd30", label: "Find Dumps Plus 30 ngày", duration_seconds: 30 * 86400, kind: "day", value: 30, sort_order: 304, enabled: true, app_code: "find-dumps", app_label: "Find Dumps", key_signature: "SUNNY", allow_reset: false, free_selection_mode: "package", free_selection_expand: true, default_package_code: "plus", default_credit_code: null, default_wallet_kind: null },
];

const DEFAULT_FIND_DUMPS_CREDIT_KEY_ROWS = [
  { code: "fd_credit", label: "Find Dumps credit", duration_seconds: 72 * 3600, kind: "day", value: 3, sort_order: 310, enabled: true, app_code: "find-dumps", app_label: "Find Dumps", key_signature: "SUNNY", allow_reset: false, free_selection_mode: "credit", free_selection_expand: true, default_package_code: null, default_credit_code: "credit-normal", default_wallet_kind: "normal" },
];

const FAKE_LAG_PACKAGES = [
  { code: "go", label: "Fake Lag Go", enabled: true, defaultDays: 7, oneTimeUse: true, resetDaily: false },
  { code: "plus", label: "Fake Lag Plus", enabled: true, defaultDays: 30, oneTimeUse: true, resetDaily: false },
  { code: "pro", label: "Fake Lag Pro", enabled: true, defaultDays: 30, oneTimeUse: false, resetDaily: false },
] as const;

const FAKE_LAG_CREDITS = [
  { code: "usage-normal", label: "Lượt dùng thường", defaultAmount: 10, allowDecimal: false, expiresHours: 720, oneTimeUse: true, walletKind: "normal" as const },
  { code: "usage-vip", label: "Lượt dùng VIP", defaultAmount: 3, allowDecimal: false, expiresHours: 720, oneTimeUse: true, walletKind: "vip" as const },
] as const;

const DEFAULT_FAKE_LAG_PACKAGE_KEY_ROWS = [
  { code: "fl_go", label: "Fake Lag Go 7 ngày", duration_seconds: 7 * 86400, kind: "day", value: 7, sort_order: 402, enabled: true, app_code: "fake-lag", app_label: "Fake Lag", key_signature: "FAKELAG", allow_reset: false, free_selection_mode: "package", free_selection_expand: true, default_package_code: "go", default_credit_code: null, default_wallet_kind: null },
  { code: "fl_plus", label: "Fake Lag Plus 30 ngày", duration_seconds: 30 * 86400, kind: "day", value: 30, sort_order: 403, enabled: true, app_code: "fake-lag", app_label: "Fake Lag", key_signature: "FAKELAG", allow_reset: false, free_selection_mode: "package", free_selection_expand: true, default_package_code: "plus", default_credit_code: null, default_wallet_kind: null },
];

const DEFAULT_FAKE_LAG_CREDIT_KEY_ROWS = [
  { code: "fl_usage", label: "Fake Lag lượt dùng", duration_seconds: 30 * 86400, kind: "day", value: 30, sort_order: 410, enabled: true, app_code: "fake-lag", app_label: "Fake Lag", key_signature: "FAKELAG", allow_reset: false, free_selection_mode: "credit", free_selection_expand: true, default_package_code: null, default_credit_code: "usage-normal", default_wallet_kind: "normal" },
];

function getPackageDefinitions(appCode: string) {
  return appCode === "fake-lag" ? FAKE_LAG_PACKAGES : FIND_DUMPS_PACKAGES;
}

function getCreditDefinitions(appCode: string) {
  return appCode === "fake-lag" ? FAKE_LAG_CREDITS : FIND_DUMPS_CREDITS;
}

function getDefaultKeyTypeRows(appCode: string, mode: "package" | "credit") {
  if (appCode === "fake-lag") {
    return mode === "credit" ? DEFAULT_FAKE_LAG_CREDIT_KEY_ROWS : DEFAULT_FAKE_LAG_PACKAGE_KEY_ROWS;
  }
  return mode === "credit" ? DEFAULT_FIND_DUMPS_CREDIT_KEY_ROWS : DEFAULT_FIND_DUMPS_PACKAGE_KEY_ROWS;
}


function packageSeedRows(rows: any[] | null | undefined, appCode: string) {
  const map = new Map((rows || []).map((row: any) => [String(row.package_code || "").trim().toLowerCase(), row]));
  return getPackageDefinitions(appCode).map((item: any) => {
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

function buildKeyTypeDefaults(row: any, mode: "package" | "credit", selectedCode: string, selectedLabel: string, value: number, durationSeconds: number, walletKind?: string | null) {
  const safeDuration = Math.max(3600, Number(durationSeconds || row?.duration_seconds || (mode === "credit" ? 72 * 3600 : 3 * 86400)));
  const safeValue = Math.max(1, Math.round(Number(value || row?.value || (mode === "credit" ? 1 : 3))));
  return {
    code: String(row?.code || "").trim(),
    label: String(row?.label || selectedLabel || (mode === "credit" ? "Find Dumps credit" : "Find Dumps package")).trim(),
    duration_seconds: safeDuration,
    kind: safeDuration < 86400 ? "hour" : "day",
    value: safeValue,
    sort_order: Number(row?.sort_order || 999),
    enabled: row?.enabled ?? true,
    app_code: String(row?.app_code || "find-dumps").trim() || "find-dumps",
    app_label: String(row?.app_label || "Find Dumps").trim() || "Find Dumps",
    key_signature: String(row?.key_signature || "SUNNY").trim() || "SUNNY",
    allow_reset: Boolean(row?.allow_reset ?? false),
    free_selection_mode: mode,
    free_selection_expand: true,
    default_package_code: mode === "package" ? selectedCode : null,
    default_credit_code: mode === "credit" ? selectedCode : null,
    default_wallet_kind: mode === "credit" ? (walletKind === "vip" ? "vip" : "normal") : null,
  };
}

function creditSeedRows(rows: any[] | null | undefined, appCode: string) {
  const map = new Map((rows || []).map((row: any) => [String(row.package_code || "").trim().toLowerCase(), row]));
  return getCreditDefinitions(appCode).map((item: any) => {
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

type FakeLagRuleDraft = {
  key_prefix: string;
  default_duration_hours: number;
  max_devices_per_key: number;
  max_ips_per_key: number;
  max_verify_per_key: number;
  public_enabled: boolean;
  allow_reset: boolean;
  notes: string;
};

function normalizeFakeLagRule(row?: any): FakeLagRuleDraft {
  const seconds = Number(row?.default_duration_seconds ?? 24 * 3600);
  return {
    key_prefix: String(row?.key_prefix || "FAKELAG").trim().toUpperCase() || "FAKELAG",
    default_duration_hours: Math.max(1, Math.round(seconds / 3600)),
    max_devices_per_key: Math.max(1, Number(row?.max_devices_per_key ?? 1)),
    max_ips_per_key: Math.max(1, Number(row?.max_ips_per_key ?? 1)),
    max_verify_per_key: Math.max(1, Number(row?.max_verify_per_key ?? 9999)),
    public_enabled: Boolean(row?.public_enabled ?? true),
    allow_reset: Boolean(row?.allow_reset ?? false),
    notes: String(row?.notes || "Fake Lag dùng key riêng FAKELAG, không trộn với key SUNNY của Free Fire."),
  };
}

function FakeLagLegacyServerKeyPanel({ appCode, appLabel }: { appCode: string; appLabel: string }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<FakeLagRuleDraft>(() => normalizeFakeLagRule());

  const ruleQuery = useQuery({
    queryKey: ["fake-lag-legacy-key-rule", appCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("license_access_rules")
        .select("*")
        .eq("app_code", appCode)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });

  useEffect(() => {
    if (!ruleQuery.data) return;
    setDraft(normalizeFakeLagRule(ruleQuery.data));
  }, [ruleQuery.data]);

  const saveRule = useMutation({
    mutationFn: async () => {
      const payload = {
        app_code: appCode,
        key_prefix: draft.key_prefix || "FAKELAG",
        default_duration_seconds: Math.max(1, Number(draft.default_duration_hours || 24)) * 3600,
        max_devices_per_key: Math.max(1, Number(draft.max_devices_per_key || 1)),
        max_ips_per_key: Math.max(1, Number(draft.max_ips_per_key || 1)),
        max_verify_per_key: Math.max(1, Number(draft.max_verify_per_key || 9999)),
        public_enabled: Boolean(draft.public_enabled),
        allow_reset: Boolean(draft.allow_reset),
        notes: draft.notes,
      };

      const { error } = await supabase
        .from("license_access_rules")
        .upsert(payload, { onConflict: "app_code" });
      if (error) throw error;

      const keyTypePayload = {
        code: "fake_lag_free",
        label: "Fake Lag",
        duration_seconds: payload.default_duration_seconds,
        kind: payload.default_duration_seconds < 86400 ? "hour" : "day",
        value: payload.default_duration_seconds < 86400
          ? Math.max(1, Math.round(payload.default_duration_seconds / 3600))
          : Math.max(1, Math.round(payload.default_duration_seconds / 86400)),
        sort_order: 450,
        enabled: payload.public_enabled,
        app_code: appCode,
        app_label: appLabel,
        key_signature: payload.key_prefix,
        allow_reset: payload.allow_reset,
        free_selection_mode: "legacy",
        free_selection_expand: false,
        default_package_code: null,
        default_credit_code: null,
        default_wallet_kind: null,
      };
      const keyTypeWrite = await supabase
        .from("licenses_free_key_types")
        .upsert(keyTypePayload, { onConflict: "code" });
      if (keyTypeWrite.error) throw keyTypeWrite.error;
    },
    onSuccess: async () => {
      await ruleQuery.refetch();
      toast({ title: "Đã lưu Server key Fake Lag", description: "Rule cấp key public, prefix, thiết bị, IP và lượt verify đã được cập nhật." });
    },
    onError: (error: any) => toast({
      title: "Không lưu được Server key Fake Lag",
      description: error?.message || "Kiểm tra migration license_access_rules và quyền Supabase.",
      variant: "destructive",
    }),
  });

  const updateDraft = (patch: Partial<FakeLagRuleDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">Server key riêng</Badge>
        <h1 className="text-2xl font-semibold">Server key cho {appLabel}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Fake Lag chạy kiểu gần giống Free Fire: không dùng gói/credit Find Dumps. Trang này chỉ giữ rule cấp key public, chữ ký key riêng, giới hạn thiết bị/IP/lượt verify và đồng bộ với khu Free key admin.
        </p>
      </header>

      {ruleQuery.error ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-5 text-sm text-amber-800">
            Chưa đọc được bảng <span className="font-mono">license_access_rules</span>. Hãy chạy migration mới rồi reload trang này.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Key prefix</div><div className="mt-2 text-2xl font-semibold">{draft.key_prefix}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Thiết bị / key</div><div className="mt-2 text-2xl font-semibold">{draft.max_devices_per_key}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">IP / key</div><div className="mt-2 text-2xl font-semibold">{draft.max_ips_per_key}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cấu hình cấp key Fake Lag</CardTitle>
          <CardDescription>
            Key public sinh ra sẽ có dạng <span className="font-mono">{draft.key_prefix || "FAKELAG"}-XXXX-XXXX-XXXX</span>. Server verify sẽ dựa vào rule này, không tin version/key rule hardcode trong app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Chữ ký key</div>
              <Input value={draft.key_prefix} onChange={(e) => updateDraft({ key_prefix: e.target.value.replace(/[^a-z0-9_-]/gi, "").toUpperCase() })} placeholder="FAKELAG" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Hạn key sau khi vượt (giờ)</div>
              <Input type="number" min={1} value={draft.default_duration_hours} onChange={(e) => updateDraft({ default_duration_hours: Number(e.target.value || 1) })} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Max thiết bị / key</div>
              <Input type="number" min={1} value={draft.max_devices_per_key} onChange={(e) => updateDraft({ max_devices_per_key: Number(e.target.value || 1) })} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Max IP / key</div>
              <Input type="number" min={1} value={draft.max_ips_per_key} onChange={(e) => updateDraft({ max_ips_per_key: Number(e.target.value || 1) })} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Max lượt verify / key</div>
              <Input type="number" min={1} value={draft.max_verify_per_key} onChange={(e) => updateDraft({ max_verify_per_key: Number(e.target.value || 1) })} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-2xl border p-4">
              <div>
                <div className="font-medium">Bật phát key public</div>
                <div className="text-sm text-muted-foreground">Tắt thì người dùng không lấy được key Fake Lag từ trang free.</div>
              </div>
              <Switch checked={draft.public_enabled} onCheckedChange={(checked) => updateDraft({ public_enabled: checked })} />
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-4">
              <div>
                <div className="font-medium">Cho phép reset public</div>
                <div className="text-sm text-muted-foreground">Bật nếu muốn key Fake Lag có thể reset thiết bị ở trang public.</div>
              </div>
              <Switch checked={draft.allow_reset} onCheckedChange={(checked) => updateDraft({ allow_reset: checked })} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Ghi chú</div>
            <Input value={draft.notes} onChange={(e) => updateDraft({ notes: e.target.value })} />
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-600">
            Luồng đúng: Admin cấu hình rule ở đây → Free key admin dùng app <span className="font-medium">fake-lag</span> để sinh key → app Android verify key với server → server kiểm tra prefix, version policy, thiết bị, IP, lượt verify, blocklist rồi mới trả OK.
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveRule.mutate()} disabled={saveRule.isPending || ruleQuery.isFetching}>Lưu Server key Fake Lag</Button>
      </div>
    </section>
  );
}


export function AdminServerAppKeysPage() {
  const { appCode = "find-dumps" } = useParams();
  const meta = useMemo(() => getServerAppMeta(appCode), [appCode]);
  const { toast } = useToast();
  const [issueKind, setIssueKind] = useState<"package" | "credit">("package");
  const [selectedPackageCode, setSelectedPackageCode] = useState<string>(() => getPackageDefinitions(appCode)[0]?.code ?? "go");
  const [selectedCreditCode, setSelectedCreditCode] = useState<string>(() => getCreditDefinitions(appCode)[0]?.code ?? "credit-normal");

  const rewardsQuery = useQuery({
    queryKey: ["server-app-keys-lite", appCode],
    queryFn: async () => {
      const [rewardsRes, keyTypesRes] = await Promise.all([
        supabase
          .from("server_app_reward_packages")
          .select("id,package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds")
          .eq("app_code", appCode)
          .order("sort_order", { ascending: true }),
        supabase
          .from("licenses_free_key_types")
          .select("code,label,duration_seconds,kind,value,sort_order,enabled,app_code,app_label,key_signature,allow_reset,free_selection_mode,free_selection_expand,default_package_code,default_credit_code,default_wallet_kind")
          .eq("app_code", appCode)
          .order("sort_order", { ascending: true }),
      ]);
      if (rewardsRes.error) throw rewardsRes.error;
      if (keyTypesRes.error) throw keyTypesRes.error;
      return {
        rewards: rewardsRes.data as any[],
        keyTypes: keyTypesRes.data as any[],
      };
    },
    retry: false,
  });

  const [packageDrafts, setPackageDrafts] = useState<any[]>(() => packageSeedRows([], appCode));
  const [creditDrafts, setCreditDrafts] = useState<any[]>(() => creditSeedRows([], appCode));

  useEffect(() => {
    if (!rewardsQuery.data) return;
    setPackageDrafts(packageSeedRows(rewardsQuery.data.rewards, appCode));
    setCreditDrafts(creditSeedRows(rewardsQuery.data.rewards, appCode));
    const packageDefault = rewardsQuery.data.keyTypes?.find((row: any) => String(row.free_selection_mode || "").trim().toLowerCase() === "package" && String(row.default_package_code || "").trim())?.default_package_code;
    const creditDefault = rewardsQuery.data.keyTypes?.find((row: any) => String(row.free_selection_mode || "").trim().toLowerCase() === "credit" && String(row.default_credit_code || "").trim())?.default_credit_code;
    if (packageDefault) setSelectedPackageCode(String(packageDefault).trim().toLowerCase());
    if (creditDefault) setSelectedCreditCode(String(creditDefault).trim().toLowerCase());
  }, [rewardsQuery.data, appCode]);

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
          soft_credit_amount: 0,
          premium_credit_amount: 0,
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

      const selectedCredit = creditDrafts.find((item) => item.code === selectedCreditCode) || creditDrafts[0];
      const selectedPackage = packageDrafts.find((item) => item.code === selectedPackageCode) || packageDrafts[0];
      const allKeyTypeRows = rewardsQuery.data?.keyTypes || [];
      const detectedCreditRows = allKeyTypeRows.filter((row: any) => String(row.free_selection_mode || "").trim().toLowerCase() === "credit" || String(row.code || "").toLowerCase().includes("credit"));
      const detectedPackageRows = allKeyTypeRows.filter((row: any) => !(String(row.free_selection_mode || "").trim().toLowerCase() === "credit" || String(row.code || "").toLowerCase().includes("credit")));
      const creditRows = detectedCreditRows.length ? detectedCreditRows : getDefaultKeyTypeRows(appCode, "credit");
      const packageRows = detectedPackageRows.length ? detectedPackageRows : getDefaultKeyTypeRows(appCode, "package");

      if (creditRows.length && selectedCredit) {
        const creditUpdate = creditRows.map((row: any) => buildKeyTypeDefaults(
          row,
          "credit",
          selectedCredit.code,
          selectedCredit.label,
          1,
          Number(selectedCredit.expiresHours || 72) * 3600,
          selectedCredit.walletKind,
        ));
        const creditWrite = await supabase.from("licenses_free_key_types").upsert(creditUpdate, { onConflict: "code" });
        if (creditWrite.error) throw creditWrite.error;
      }

      if (packageRows.length && selectedPackage) {
        const packageUpdate = packageRows.map((row: any) => buildKeyTypeDefaults(
          row,
          "package",
          selectedPackage.code,
          selectedPackage.label,
          Number(selectedPackage.durationDays || 3),
          Number(selectedPackage.durationDays || 3) * 86400,
          null,
        ));
        const packageWrite = await supabase.from("licenses_free_key_types").upsert(packageUpdate, { onConflict: "code" });
        if (packageWrite.error) throw packageWrite.error;
      }
    },
    onSuccess: async () => {
      await rewardsQuery.refetch();
      toast({ title: "Đã lưu Server key", description: `Package key và credit key của ${meta.label} đã được cập nhật.` });
    },
    onError: (error: any) => toast({ title: "Không lưu được Server key", description: error?.message || "Vui lòng kiểm tra bảng server_app_reward_packages.", variant: "destructive" }),
  });

  if (appCode === "fake-lag") {
    return <FakeLagLegacyServerKeyPanel appCode={appCode} appLabel={meta.label} />;
  }

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

  const selectedPackage = packageDrafts.find((item) => item.code === selectedPackageCode) || packageDrafts[0];
  const selectedCredit = creditDrafts.find((item) => item.code === selectedCreditCode) || creditDrafts[0];
  const selectedCode = issueKind === "credit" ? selectedCreditCode : selectedPackageCode;

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">Server key</Badge>
        <h1 className="text-2xl font-semibold">Server key cho {meta.label}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">Khu này tách hẳn khỏi Runtime và Audit Log. Package key, credit key, số lần dùng, thời hạn và cách bung lựa chọn ở trang free/public được quản lý riêng cho từng app-host.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Package key</div><div className="mt-1 text-2xl font-semibold">{packageDrafts.length}</div></div><TicketPercent className="h-5 w-5 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Credit key</div><div className="mt-1 text-2xl font-semibold">{creditDrafts.length}</div></div><KeyRound className="h-5 w-5 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Rule lõi</div><div className="mt-1 text-2xl font-semibold">One-time + Auto-expire</div></div><ShieldCheck className="h-5 w-5 text-primary" /></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview hành vi ở trang public</CardTitle>
          <CardDescription>Khi chọn key ở trang public, user chỉ bung thêm lựa chọn package hoặc credit. Các ngày/giờ cụ thể được chốt sẵn ở server key, không bắt user nhập lại.</CardDescription>
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
            <Select value={selectedCode} onValueChange={(value) => issueKind === "credit" ? setSelectedCreditCode(value) : setSelectedPackageCode(value)}>
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
