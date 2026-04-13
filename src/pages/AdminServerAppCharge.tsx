import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Coins, Layers3, Wallet2 } from "lucide-react";
import { useParams } from "react-router-dom";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FIND_DUMPS_CREDITS, FIND_DUMPS_FEATURES, FIND_DUMPS_PACKAGES, FIND_DUMPS_UNLOCKS, computeFindDumpsFeatureCost, formatCredit, getServerAppMeta } from "@/lib/serverAppPolicies";

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlanRows(rows: any[] | null | undefined) {
  const map = new Map((rows || []).map((row: any) => [String(row.plan_code || "").trim().toLowerCase(), row]));
  return FIND_DUMPS_PACKAGES.map((item) => {
    const hit = map.get(item.code);
    return {
      code: item.code,
      label: item.label,
      enabled: hit?.enabled ?? item.enabled,
      discountPercent: Math.max(0, Math.round((1 - asNumber(hit?.soft_cost_multiplier, 1)) * 10000) / 100),
      discountPercentVip: Math.max(0, Math.round((1 - asNumber(hit?.premium_cost_multiplier, 1)) * 10000) / 100),
      dailyCredit: asNumber(hit?.daily_soft_credit, item.dailyCredit),
      dailyVipCredit: asNumber(hit?.daily_premium_credit, item.dailyVipCredit),
      resetDaily: item.resetDaily,
    };
  });
}

function normalizeFeatureRows(rows: any[] | null | undefined) {
  const map = new Map((rows || []).map((row: any) => [String(row.feature_code || "").trim().toLowerCase(), row]));
  const seeds = new Map(FIND_DUMPS_FEATURES.map((feature) => [feature.code, feature]));
  const orderedCodes = Array.from(new Set([
    ...FIND_DUMPS_FEATURES.map((feature) => feature.code),
    ...(rows || []).map((row: any) => String(row.feature_code || "").trim().toLowerCase()).filter(Boolean),
  ])).filter((code) => !code.startsWith("unlock_"));
  return orderedCodes.map((code) => {
    const feature = seeds.get(code) || {
      code,
      title: code,
      baseCredit: 0,
      vipCredit: 0,
      freeForClassic: false,
      discountablePlans: ["classic", "go", "plus", "pro"],
      limitLabel: "Theo rule server",
    };
    const hit = map.get(code);
    return {
      code,
      title: hit?.title || feature.title,
      enabled: hit?.enabled ?? true,
      requiresCredit: hit?.requires_credit ?? ((feature.baseCredit > 0) || (feature.vipCredit > 0)),
      softCost: asNumber(hit?.soft_cost, feature.baseCredit),
      vipCost: asNumber(hit?.premium_cost, feature.vipCredit),
      minPlan: String(hit?.min_plan || (feature.discountablePlans[0] || "classic")),
      badgeLabel: String(hit?.badge_label || (feature.baseCredit > 0 ? "Tính credit" : "Free")),
      limitLabel: feature.limitLabel,
      discountablePlans: feature.discountablePlans,
    };
  });
}



function normalizeUnlockRows(rows: any[] | null | undefined) {
  const map = new Map((rows || []).map((row: any) => [String(row.access_code || "").trim().toLowerCase(), row]));
  return FIND_DUMPS_UNLOCKS.map((rule) => {
    const hit = map.get(rule.unlockFeatureCode);
    const freePlans = Array.isArray(hit?.free_for_plans) ? hit.free_for_plans : rule.freePlans;
    const featureCodes = Array.isArray(hit?.guarded_feature_codes) ? hit.guarded_feature_codes : rule.guardedFeatureCodes;
    return {
      accessCode: rule.accessCode,
      unlockFeatureCode: rule.unlockFeatureCode,
      title: hit?.title || rule.title,
      description: hit?.description || rule.description,
      enabled: hit?.enabled ?? rule.enabled,
      unlockRequired: hit?.unlock_required ?? true,
      durationHours: asNumber((hit?.unlock_duration_seconds ?? rule.defaultDurationHours * 3600) / 3600, rule.defaultDurationHours),
      softUnlockCost: asNumber(hit?.soft_unlock_cost, rule.softUnlockCost),
      premiumUnlockCost: asNumber(hit?.premium_unlock_cost, rule.premiumUnlockCost),
      softUnlockCost7d: asNumber(hit?.soft_unlock_cost_7d, hit?.soft_unlock_cost ?? rule.softUnlockCost),
      premiumUnlockCost7d: asNumber(hit?.premium_unlock_cost_7d, hit?.premium_unlock_cost ?? rule.premiumUnlockCost),
      softUnlockCost30d: asNumber(hit?.soft_unlock_cost_30d, hit?.soft_unlock_cost ?? rule.softUnlockCost),
      premiumUnlockCost30d: asNumber(hit?.premium_unlock_cost_30d, hit?.premium_unlock_cost ?? rule.premiumUnlockCost),
      freePlans: Array.isArray(freePlans) ? freePlans.map((item: any) => String(item || "").trim()).filter(Boolean) : rule.freePlans,
      guardedFeatureCodes: Array.isArray(featureCodes) ? featureCodes.map((item: any) => String(item || "").trim()).filter(Boolean) : rule.guardedFeatureCodes,
      renewable: hit?.renewable ?? rule.renewable,
      revalidateOnline: hit?.revalidate_online ?? true,
      notes: String(hit?.notes || ""),
    };
  });
}


function isMissingUnlockTableError(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || error?.details || "").toLowerCase();
  return code === "PGRST205" || code === "42P01" || message.includes("server_app_feature_unlock_rules");
}

function normalizeWalletRow(row: any | null | undefined) {
  return {
    soft_wallet_label: String(row?.soft_wallet_label || "Credit thường"),
    premium_wallet_label: String(row?.premium_wallet_label || "Credit VIP"),
    allow_decimal: row?.allow_decimal ?? true,
    soft_daily_reset_enabled: row?.soft_daily_reset_enabled ?? true,
    premium_daily_reset_enabled: row?.premium_daily_reset_enabled ?? true,
    soft_daily_reset_amount: asNumber(row?.soft_daily_reset_amount, 0),
    premium_daily_reset_amount: asNumber(row?.premium_daily_reset_amount, 0),
    notes: String(row?.notes || ""),
  };
}

export function AdminServerAppChargePage() {
  const { appCode = "find-dumps" } = useParams();
  const meta = useMemo(() => getServerAppMeta(appCode), [appCode]);
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["server-app-charge-lite", appCode],
    queryFn: async () => {
      const [plansRes, featuresRes, walletRes, unlockRes] = await Promise.all([
        supabase.from("server_app_plans").select("app_code,plan_code,label,enabled,daily_soft_credit,daily_premium_credit,soft_cost_multiplier,premium_cost_multiplier").eq("app_code", appCode).order("sort_order", { ascending: true }),
        supabase.from("server_app_features").select("app_code,feature_code,title,enabled,requires_credit,soft_cost,premium_cost,min_plan,badge_label").eq("app_code", appCode).order("sort_order", { ascending: true }),
        supabase.from("server_app_wallet_rules").select("app_code,soft_wallet_label,premium_wallet_label,allow_decimal,soft_daily_reset_enabled,premium_daily_reset_enabled,soft_daily_reset_amount,premium_daily_reset_amount,notes").eq("app_code", appCode).maybeSingle(),
        supabase.from("server_app_feature_unlock_rules").select("app_code,access_code,title,description,enabled,unlock_required,unlock_duration_seconds,soft_unlock_cost,premium_unlock_cost,soft_unlock_cost_7d,premium_unlock_cost_7d,soft_unlock_cost_30d,premium_unlock_cost_30d,free_for_plans,guarded_feature_codes,renewable,revalidate_online,notes").eq("app_code", appCode).order("sort_order", { ascending: true }),
      ]);
      if (plansRes.error) throw plansRes.error;
      if (featuresRes.error) throw featuresRes.error;
      if (walletRes.error) throw walletRes.error;
      const unlockRows = unlockRes.error
        ? (isMissingUnlockTableError(unlockRes.error) ? [] : (() => { throw unlockRes.error; })())
        : (unlockRes.data as any[]);
      return {
        plans: normalizePlanRows(plansRes.data as any[]),
        features: normalizeFeatureRows(featuresRes.data as any[]),
        wallet: normalizeWalletRow(walletRes.data as any),
        unlocks: normalizeUnlockRows(unlockRows as any[]),
      };
    },
    retry: false,
  });

  const [planDrafts, setPlanDrafts] = useState<any[]>(normalizePlanRows([]));
  const [featureDrafts, setFeatureDrafts] = useState<any[]>(normalizeFeatureRows([]));
  const [walletDraft, setWalletDraft] = useState<any>(normalizeWalletRow(null));
  const [unlockDrafts, setUnlockDrafts] = useState<any[]>(normalizeUnlockRows([]));

  useEffect(() => {
    if (!query.data) return;
    setPlanDrafts(query.data.plans);
    setFeatureDrafts(query.data.features);
    setWalletDraft(query.data.wallet);
    setUnlockDrafts(query.data.unlocks);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const planPayload = planDrafts.map((plan) => ({
        app_code: appCode,
        plan_code: plan.code,
        label: plan.label,
        enabled: Boolean(plan.enabled),
        daily_soft_credit: asNumber(plan.dailyCredit),
        daily_premium_credit: asNumber(plan.dailyVipCredit),
        soft_cost_multiplier: Math.max(0, 1 - asNumber(plan.discountPercent) / 100),
        premium_cost_multiplier: Math.max(0, 1 - asNumber(plan.discountPercentVip) / 100),
      }));
      const featurePayload = featureDrafts.map((feature, index) => ({
        app_code: appCode,
        feature_code: feature.code,
        title: feature.title,
        enabled: Boolean(feature.enabled),
        requires_credit: Boolean(feature.requiresCredit),
        soft_cost: asNumber(feature.softCost),
        premium_cost: asNumber(feature.vipCost),
        min_plan: feature.minPlan,
        badge_label: feature.badgeLabel,
        sort_order: (index + 1) * 10,
      }));
      const unlockPayload = unlockDrafts.map((rule, index) => ({
        app_code: appCode,
        access_code: rule.unlockFeatureCode,
        title: rule.title,
        description: rule.description,
        enabled: Boolean(rule.enabled),
        unlock_required: Boolean(rule.unlockRequired),
        unlock_duration_seconds: Math.max(3600, Math.trunc(asNumber(rule.durationHours, 24) * 3600)),
        soft_unlock_cost: asNumber(rule.softUnlockCost),
        premium_unlock_cost: asNumber(rule.premiumUnlockCost),
        soft_unlock_cost_7d: asNumber(rule.softUnlockCost7d),
        premium_unlock_cost_7d: asNumber(rule.premiumUnlockCost7d),
        soft_unlock_cost_30d: asNumber(rule.softUnlockCost30d),
        premium_unlock_cost_30d: asNumber(rule.premiumUnlockCost30d),
        free_for_plans: (rule.freePlans || []).map((item: any) => String(item || "").trim()).filter(Boolean),
        guarded_feature_codes: (rule.guardedFeatureCodes || []).map((item: any) => String(item || "").trim()).filter(Boolean),
        renewable: Boolean(rule.renewable),
        revalidate_online: Boolean(rule.revalidateOnline),
        notes: String(rule.notes || "").trim() || null,
        sort_order: 300 + (index + 1) * 10,
      }));
      const walletPayload = {
        app_code: appCode,
        soft_wallet_label: String(walletDraft.soft_wallet_label || "Credit thường"),
        premium_wallet_label: String(walletDraft.premium_wallet_label || "Credit VIP"),
        allow_decimal: Boolean(walletDraft.allow_decimal),
        soft_daily_reset_enabled: Boolean(walletDraft.soft_daily_reset_enabled),
        premium_daily_reset_enabled: Boolean(walletDraft.premium_daily_reset_enabled),
        soft_daily_reset_amount: asNumber(walletDraft.soft_daily_reset_amount),
        premium_daily_reset_amount: asNumber(walletDraft.premium_daily_reset_amount),
        notes: String(walletDraft.notes || "").trim() || null,
      };
      const [plansWrite, featuresWrite, walletWrite, unlockWrite] = await Promise.all([
        supabase.from("server_app_plans").upsert(planPayload, { onConflict: "app_code,plan_code" }),
        supabase.from("server_app_features").upsert(featurePayload, { onConflict: "app_code,feature_code" }),
        supabase.from("server_app_wallet_rules").upsert(walletPayload, { onConflict: "app_code" }),
        supabase.from("server_app_feature_unlock_rules").upsert(unlockPayload, { onConflict: "app_code,access_code" }),
      ]);
      if (plansWrite.error) throw plansWrite.error;
      if (featuresWrite.error) throw featuresWrite.error;
      if (walletWrite.error) throw walletWrite.error;
      if (unlockWrite.error) throw unlockWrite.error;
    },
    onSuccess: async () => {
      await query.refetch();
      toast({ title: "Đã lưu Charge / Credit Rules", description: "Giảm giá theo gói, reset hằng ngày, giá từng chức năng và rule mở khóa đã được cập nhật." });
    },
    onError: (error: any) => toast({ title: "Không lưu được Charge / Credit Rules", description: error?.message || "Vui lòng kiểm tra các bảng server_app_plans, server_app_features, server_app_wallet_rules.", variant: "destructive" }),
  });

  if (appCode === "free-fire") {
    return (
      <section className="space-y-4">
        <Badge variant="secondary">Legacy charging</Badge>
        <h1 className="text-2xl font-semibold">Free Fire không dùng Charge / Credit Rules ở app-host</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Free Fire giữ nguyên hệ key legacy. Tab này dành cho Find Dumps và các app-host mới khi cần tính credit số thập phân, giảm giá theo gói và reset hằng ngày.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">Charge / Credit Rules</Badge>
        <h1 className="text-2xl font-semibold">Charge / Credit Rules cho {meta.label}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">Tab này được chia nhỏ thành 3 cụm: gói, credit và chức năng app. Mỗi chức năng chỉ bung ra khi bấm vào để tránh một trang dài ngoằng khó quản lý.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-5">
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Gói</div><div className="mt-2 text-2xl font-semibold">{planDrafts.length}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Credit type</div><div className="mt-2 text-2xl font-semibold">{FIND_DUMPS_CREDITS.length}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Function tính credit</div><div className="mt-2 text-2xl font-semibold">{featureDrafts.filter((item) => item.requiresCredit).length}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Decimal credit</div><div className="mt-2 text-2xl font-semibold">{walletDraft.allow_decimal ? "Bật" : "Tắt"}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Rule mở khóa</div><div className="mt-2 text-2xl font-semibold">{unlockDrafts.filter((item) => item.unlockRequired).length}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" /> Cụm gói</CardTitle>
            <CardDescription>Mỗi gói có discount % thật, reset credit theo ngày thật và trạng thái bật/tắt riêng.</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="space-y-3">
              {planDrafts.map((plan, index) => (
                <AccordionItem key={plan.code} value={plan.code} className="rounded-2xl border px-4">
                  <AccordionTrigger>
                    <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-4 text-left">
                      <div>
                        <div className="font-medium">{plan.label}</div>
                        <div className="text-xs text-muted-foreground">Discount thường {formatCredit(plan.discountPercent)}% · VIP {formatCredit(plan.discountPercentVip)}% · reset {plan.resetDaily ? "theo ngày" : "tắt"}</div>
                      </div>
                      <Badge variant={plan.enabled ? "outline" : "secondary"}>{plan.enabled ? "Đang bật" : "Tắt"}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pb-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2"><div className="text-sm font-medium">Discount % thường</div><Input type="number" step="0.1" value={plan.discountPercent} onChange={(e) => setPlanDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, discountPercent: Number(e.target.value || 0) } : item))} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Discount % VIP</div><Input type="number" step="0.1" value={plan.discountPercentVip} onChange={(e) => setPlanDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, discountPercentVip: Number(e.target.value || 0) } : item))} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Daily credit</div><Input type="number" step="0.1" value={plan.dailyCredit} onChange={(e) => setPlanDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, dailyCredit: Number(e.target.value || 0) } : item))} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Daily credit VIP</div><Input type="number" step="0.1" value={plan.dailyVipCredit} onChange={(e) => setPlanDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, dailyVipCredit: Number(e.target.value || 0) } : item))} /></div>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
                      <div>
                        <div className="text-sm font-medium">Bật gói {plan.label}</div>
                        <div className="text-xs text-muted-foreground">Tắt gói ở đây sẽ làm gói không còn tác dụng khi tính giá credit và reset theo ngày.</div>
                      </div>
                      <Switch checked={Boolean(plan.enabled)} onCheckedChange={(checked) => setPlanDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: checked } : item))} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet2 className="h-4 w-4 text-primary" /> Cụm credit</CardTitle>
            <CardDescription>Credit thường và credit VIP được quản lý riêng. Decimal credit và reset hằng ngày phải có tác dụng thật.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><div className="text-sm font-medium">Tên ví thường</div><Input value={walletDraft.soft_wallet_label} onChange={(e) => setWalletDraft((prev: any) => ({ ...prev, soft_wallet_label: e.target.value }))} /></div>
              <div className="space-y-2"><div className="text-sm font-medium">Tên ví VIP</div><Input value={walletDraft.premium_wallet_label} onChange={(e) => setWalletDraft((prev: any) => ({ ...prev, premium_wallet_label: e.target.value }))} /></div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
              <div>
                <div className="text-sm font-medium">Cho phép decimal credit</div>
                <div className="text-xs text-muted-foreground">Hệ thống chấp nhận 0.1, 0.2, 1.5 thay vì làm tròn giả.</div>
              </div>
              <Switch checked={Boolean(walletDraft.allow_decimal)} onCheckedChange={(checked) => setWalletDraft((prev: any) => ({ ...prev, allow_decimal: checked }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><div className="text-sm font-medium">Reset thường / ngày</div><Input type="number" step="0.1" value={walletDraft.soft_daily_reset_amount} onChange={(e) => setWalletDraft((prev: any) => ({ ...prev, soft_daily_reset_amount: Number(e.target.value || 0) }))} /></div>
              <div className="space-y-2"><div className="text-sm font-medium">Reset VIP / ngày</div><Input type="number" step="0.1" value={walletDraft.premium_daily_reset_amount} onChange={(e) => setWalletDraft((prev: any) => ({ ...prev, premium_daily_reset_amount: Number(e.target.value || 0) }))} /></div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              {FIND_DUMPS_CREDITS.map((credit) => (
                <div key={credit.code} className="flex items-center justify-between gap-3 py-1">
                  <span>{credit.label}</span>
                  <span className="font-medium text-foreground">{formatCredit(credit.defaultAmount)} · hết hạn {credit.expiresHours} giờ · {credit.walletKind === "vip" ? "ví VIP" : "ví thường"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> Cụm chức năng app</CardTitle>
          <CardDescription>Ban đầu chỉ hiện tên và tóm tắt. Bấm vào từng chức năng mới bung phần chỉnh sâu để tab không bị kéo dài khủng khiếp.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="space-y-3">
            {featureDrafts.map((feature, index) => {
              const preview = computeFindDumpsFeatureCost(feature.code, { planCode: "plus", walletKind: "normal" });
              return (
                <AccordionItem key={feature.code} value={feature.code} className="rounded-2xl border px-4">
                  <AccordionTrigger>
                    <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-4 text-left">
                      <div>
                        <div className="font-medium">{feature.title}</div>
                        <div className="text-xs text-muted-foreground">{feature.badgeLabel} · soft {formatCredit(feature.softCost)} · vip {formatCredit(feature.vipCost)} · preview Plus {formatCredit(preview.effectiveCost)}</div>
                      </div>
                      <Badge variant={feature.enabled ? "outline" : "secondary"}>{feature.enabled ? "Đang bật" : "Tắt"}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pb-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2"><div className="text-sm font-medium">Giá credit thường</div><Input type="number" step="0.1" value={feature.softCost} onChange={(e) => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, softCost: Number(e.target.value || 0) } : item))} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Giá credit VIP</div><Input type="number" step="0.1" value={feature.vipCost} onChange={(e) => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, vipCost: Number(e.target.value || 0) } : item))} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Gói tối thiểu</div><Input value={feature.minPlan} onChange={(e) => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, minPlan: e.target.value } : item))} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Badge / tóm tắt</div><Input value={feature.badgeLabel} onChange={(e) => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, badgeLabel: e.target.value } : item))} /></div>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
                      <div>
                        <div className="text-sm font-medium">Bật chức năng {feature.title}</div>
                        <div className="text-xs text-muted-foreground">{feature.limitLabel} · Discount áp dụng cho {feature.discountablePlans.join(", ")}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">Tính credit</span>
                        <Switch checked={Boolean(feature.requiresCredit)} onCheckedChange={(checked) => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, requiresCredit: checked } : item))} />
                        <Switch checked={Boolean(feature.enabled)} onCheckedChange={(checked) => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: checked } : item))} />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mở khóa chức năng</CardTitle>
          <CardDescription>Tab này không thay cho tiêu hao credit. Mở khóa chỉ mở quyền đi qua cổng sử dụng. Khi chạy batch, search diện rộng, Binary Workspace hoặc export lớn thì app vẫn tiêu hao credit theo feature tương ứng.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="space-y-3">
            {unlockDrafts.map((rule, index) => (
              <AccordionItem key={rule.unlockFeatureCode} value={rule.unlockFeatureCode} className="rounded-2xl border px-4">
                <AccordionTrigger>
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-4 text-left">
                    <div>
                      <div className="font-medium">{rule.title}</div>
                      <div className="text-xs text-muted-foreground">{rule.unlockFeatureCode} · {rule.unlockRequired ? "Cần mở khóa" : "Không bắt buộc"} · giá 1 ngày / 7 ngày / 30 ngày chỉnh riêng</div>
                    </div>
                    <Badge variant={rule.enabled ? "outline" : "secondary"}>{rule.enabled ? "Đang bật" : "Tắt"}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2"><div className="text-sm font-medium">Tên hiển thị</div><Input value={rule.title} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Thời hạn mặc định (giờ)</div><Input type="number" step="1" value={rule.durationHours} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, durationHours: Number(e.target.value || 0) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Giá 1 ngày · thường</div><Input type="number" step="0.1" value={rule.softUnlockCost} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, softUnlockCost: Number(e.target.value || 0) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Giá 1 ngày · VIP</div><Input type="number" step="0.1" value={rule.premiumUnlockCost} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premiumUnlockCost: Number(e.target.value || 0) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Giá 7 ngày · thường</div><Input type="number" step="0.1" value={rule.softUnlockCost7d} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, softUnlockCost7d: Number(e.target.value || 0) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Giá 7 ngày · VIP</div><Input type="number" step="0.1" value={rule.premiumUnlockCost7d} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premiumUnlockCost7d: Number(e.target.value || 0) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Giá 30 ngày · thường</div><Input type="number" step="0.1" value={rule.softUnlockCost30d} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, softUnlockCost30d: Number(e.target.value || 0) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Giá 30 ngày · VIP</div><Input type="number" step="0.1" value={rule.premiumUnlockCost30d} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premiumUnlockCost30d: Number(e.target.value || 0) } : item))} /></div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><div className="text-sm font-medium">Mô tả</div><Input value={rule.description} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, description: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Gói được mở free</div><Input value={(rule.freePlans || []).join(", ")} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, freePlans: e.target.value.split(",").map((part) => part.trim()).filter(Boolean) } : item))} placeholder="go, plus, pro" /></div>
                  </div>
                  <div className="space-y-2"><div className="text-sm font-medium">Các feature bị chặn bởi rule này</div><Input value={(rule.guardedFeatureCodes || []).join(", ")} onChange={(e) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, guardedFeatureCodes: e.target.value.split(",").map((part) => part.trim()).filter(Boolean) } : item))} placeholder="binary_scan_full, workspace_batch, export_json" /></div>
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="text-sm font-medium">Bật rule mở khóa</div>
                      <div className="text-xs text-muted-foreground">Tắt rule này nghĩa là app sẽ không chặn trước cửa nhóm chức năng tương ứng.</div>
                    </div>
                    <Switch checked={Boolean(rule.enabled)} onCheckedChange={(checked) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: checked } : item))} />
                    <span className="text-xs text-muted-foreground">Yêu cầu mở khóa</span>
                    <Switch checked={Boolean(rule.unlockRequired)} onCheckedChange={(checked) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, unlockRequired: checked } : item))} />
                    <span className="text-xs text-muted-foreground">Cho gia hạn</span>
                    <Switch checked={Boolean(rule.renewable)} onCheckedChange={(checked) => setUnlockDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, renewable: checked } : item))} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || query.isFetching}>Lưu Charge / Credit Rules</Button>
      </div>
    </section>
  );
}
