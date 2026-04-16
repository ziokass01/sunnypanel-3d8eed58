import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Gift, RefreshCw, ShieldCheck, Sparkles, TicketPercent, WandSparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatVietnameseDateTime, fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/dateFormat";
import { asNumber, insertAdminAuditLog, insertRuntimeAdminEvent } from "@/lib/serverAppAdmin";

function randomRedeemCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `SUNNY-${part()}-${part()}-${part()}`;
}

const EMPTY_DRAFT = {
  id: "",
  redeem_key: randomRedeemCode(),
  enabled: true,
  title: "Go 7 ngày + credit nhẹ",
  note: "Mã quà riêng cho Find Dumps. Không đụng free admin cũ.",
  reward_mode: "mixed",
  plan_code: "go",
  entitlement_days: "7",
  soft_credit_amount: "5",
  premium_credit_amount: "0",
  max_redemptions: "200",
  max_redeems_per_ip: "2",
  max_redeems_per_device: "1",
  max_redeems_per_account: "1",
  starts_at: "",
  expires_at: "",
  allow_same_plan_extension: false,
  apply_days_only_if_greater: true,
  same_plan_credit_only: true,
  keep_higher_plan: true,
  apply_plan_if_higher: true,
};

export function AdminServerAppRedeemPage() {
  const { appCode = "find-dumps" } = useParams();
  const { toast } = useToast();
  const sb = supabase as any;
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<any>(EMPTY_DRAFT);
  const [giftTabLabel, setGiftTabLabel] = useState("Mã quà");

  const query = useQuery({
    queryKey: ["server-app-redeem-admin", appCode],
    enabled: appCode === "find-dumps",
    queryFn: async () => {
      const [keysRes, settingsRes] = await Promise.all([
        sb.from("server_app_redeem_keys").select("*").eq("app_code", appCode).order("created_at", { ascending: false }).limit(100),
        sb.from("server_app_settings").select("app_code,gift_tab_label").eq("app_code", appCode).maybeSingle(),
      ]);
      if (keysRes.error) throw keysRes.error;
      if (settingsRes.error) throw settingsRes.error;
      return {
        keys: keysRes.data || [],
        settings: settingsRes.data || null,
      };
    },
    retry: false,
  });

  useEffect(() => {
    if (!query.data) return;
    setGiftTabLabel(query.data.settings?.gift_tab_label || "Mã quà");
    const first = query.data.keys[0];
    if (!selectedId && first) {
      setSelectedId(first.id);
      hydrateDraft(first);
    }
    if (!query.data.keys.length) {
      setSelectedId("");
      setDraft({ ...EMPTY_DRAFT, redeem_key: randomRedeemCode() });
    }
  }, [query.data]);

  const hydrateDraft = (row: any) => {
    setDraft({
      id: String(row.id || ""),
      redeem_key: String(row.redeem_key || randomRedeemCode()),
      enabled: row.enabled ?? true,
      title: String(row.title || row.metadata?.title || row.plan_code || row.reward_mode || "Redeem key"),
      note: String(row.notes || row.metadata?.note || ""),
      reward_mode: String(row.reward_mode || "mixed"),
      plan_code: String(row.plan_code || "go"),
      entitlement_days: String(row.entitlement_days ?? 0),
      soft_credit_amount: String(row.soft_credit_amount ?? 0),
      premium_credit_amount: String(row.premium_credit_amount ?? 0),
      max_redemptions: String(row.max_redemptions ?? 1),
      max_redeems_per_ip: String(row.max_redeems_per_ip ?? 0),
      max_redeems_per_device: String(row.max_redeems_per_device ?? 0),
      max_redeems_per_account: String(row.max_redeems_per_account ?? 0),
      starts_at: toDateTimeLocalValue(row.starts_at || null),
      expires_at: toDateTimeLocalValue(row.expires_at || null),
      allow_same_plan_extension: Boolean(row.allow_same_plan_extension),
      apply_days_only_if_greater: row.apply_days_only_if_greater ?? true,
      same_plan_credit_only: row.same_plan_credit_only ?? true,
      keep_higher_plan: row.keep_higher_plan ?? true,
      apply_plan_if_higher: row.apply_plan_if_higher ?? true,
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        id: draft.id || undefined,
        app_code: appCode,
        reward_package_id: null,
        redeem_key: String(draft.redeem_key || "").trim().toUpperCase(),
        title: String(draft.title || "").trim() || null,
        description: String(draft.note || "").trim() || null,
        enabled: Boolean(draft.enabled),
        starts_at: fromDateTimeLocalValue(draft.starts_at),
        expires_at: fromDateTimeLocalValue(draft.expires_at),
        max_redemptions: Math.max(1, Math.trunc(asNumber(draft.max_redemptions, 1))),
        reward_mode: draft.reward_mode,
        plan_code: draft.reward_mode === "soft_credit" || draft.reward_mode === "premium_credit" ? null : (draft.plan_code || null),
        soft_credit_amount: asNumber(draft.soft_credit_amount),
        premium_credit_amount: asNumber(draft.premium_credit_amount),
        entitlement_days: Math.max(0, Math.trunc(asNumber(draft.entitlement_days, 0))),
        max_redeems_per_ip: Math.max(0, Math.trunc(asNumber(draft.max_redeems_per_ip, 0))),
        max_redeems_per_device: Math.max(0, Math.trunc(asNumber(draft.max_redeems_per_device, 0))),
        max_redeems_per_account: Math.max(0, Math.trunc(asNumber(draft.max_redeems_per_account, 0))),
        allow_same_plan_extension: Boolean(draft.allow_same_plan_extension),
        apply_days_only_if_greater: Boolean(draft.apply_days_only_if_greater),
        same_plan_credit_only: Boolean(draft.same_plan_credit_only),
        keep_higher_plan: Boolean(draft.keep_higher_plan),
        apply_plan_if_higher: Boolean(draft.apply_plan_if_higher),
        metadata: {
          title: draft.title,
          note: draft.note,
        },
        notes: draft.note || null,
      };
      const write = await sb.from("server_app_redeem_keys").upsert(payload, { onConflict: "app_code,redeem_key" }).select("id").single();
      if (write.error) throw write.error;
      const settingsWrite = await sb.from("server_app_settings").upsert({ app_code: appCode, gift_tab_label: giftTabLabel || "Mã quà" }, { onConflict: "app_code" });
      if (settingsWrite.error) throw settingsWrite.error;
      await insertAdminAuditLog({
        appCode,
        targetKind: "redeem",
        targetValue: payload.redeem_key,
        action: payload.id ? "update_redeem_key" : "create_redeem_key",
        reason: draft.note,
        payload,
      });
      await insertRuntimeAdminEvent({ appCode, code: payload.id ? "ADMIN_REDEEM_UPDATE" : "ADMIN_REDEEM_CREATE", message: `Admin lưu redeem ${payload.redeem_key}`, meta: { redeem_key: payload.redeem_key } });
      return write.data;
    },
    onSuccess: async (data: any) => {
      await query.refetch();
      if (data?.id) setSelectedId(String(data.id));
      toast({ title: "Đã lưu Create Redeem", description: "Mã quà riêng cho Find Dumps đã được cập nhật cùng giới hạn IP / device / account." });
    },
    onError: (error: any) => toast({ title: "Không lưu được Create Redeem", description: error?.message || "Kiểm tra lại bảng server_app_redeem_keys.", variant: "destructive" }),
  });

  const preview = useMemo(() => {
    const plan = String(draft.plan_code || "go").toUpperCase();
    return [
      `Tổng lượt redeem: ${draft.max_redemptions || 1} • IP tối đa ${draft.max_redeems_per_ip || 0} • device tối đa ${draft.max_redeems_per_device || 0} • tài khoản tối đa ${draft.max_redeems_per_account || 0}.`,
      `Nếu user đang có gói thấp hơn ${plan} thì áp dụng gói ${plan} + credit của mã.`,
      draft.keep_higher_plan
        ? `Nếu user đang có gói cao hơn thì giữ gói hiện tại và chỉ cộng credit, không hạ gói.`
        : `Nếu tắt giữ gói cao hơn, admin đang cho phép mã ép lại gói được khai báo.` ,
      draft.same_plan_credit_only
        ? `Nếu user đang có đúng gói ${plan} thì mặc định chỉ cộng credit.`
        : `Nếu tắt credit-only khi trùng gói, mã này có thể động vào phần ngày hạn khi admin cho phép.`,
      draft.allow_same_plan_extension
        ? `Admin đã bật “cho phép gia hạn nếu trùng gói”. Nếu số ngày của mã cao hơn và toggle ngày lớn hơn đang bật thì server mới cộng thêm ngày.`
        : `Trùng gói sẽ không tự cộng thêm ngày.` ,
      draft.apply_days_only_if_greater
        ? `Nếu số ngày của mã thấp hơn mức đang có thì không lấy ngày đó.`
        : `Admin đang cho phép áp ngày mới kể cả khi ngày thấp hơn, nên cần dùng rất cẩn thận.` ,
      `Credit thường: ${draft.soft_credit_amount} • VIP: ${draft.premium_credit_amount}. Bản này cho phép âm để trừ nợ hoặc bù chéo theo quyết định admin.`,
    ];
  }, [draft]);

  if (appCode !== "find-dumps") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create Redeem</CardTitle>
          <CardDescription>Khu tạo mã quà riêng hiện chỉ bật cho Find Dumps.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Find Dumps</Badge>
            <Badge variant="outline">Create Redeem riêng</Badge>
            <Badge variant="outline">Không dính free admin</Badge>
          </div>
          <CardTitle className="text-2xl">Tạo mã quà tự do</CardTitle>
          <CardDescription>
            Tách hẳn khỏi free admin cũ. Tại đây admin quyết định tổng lượt redeem, giới hạn IP / device / tài khoản, credit âm, gói Go / Plus / Pro và logic cộng ngày khi trùng gói.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Danh sách redeem hiện có</CardTitle>
              <CardDescription>Chọn một mã để sửa hoặc tạo mới hoàn toàn.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => { setSelectedId(""); setDraft({ ...EMPTY_DRAFT, redeem_key: randomRedeemCode() }); }}><WandSparkles className="mr-2 h-4 w-4" />Tạo mã mới</Button>
                <Button type="button" variant="outline" onClick={() => setDraft((prev: any) => ({ ...prev, redeem_key: randomRedeemCode() }))}><RefreshCw className="mr-2 h-4 w-4" />Random code</Button>
              </div>
              <div className="grid gap-3">
                {(query.data?.keys || []).map((row: any) => (
                  <button key={row.id} type="button" onClick={() => { setSelectedId(String(row.id)); hydrateDraft(row); }} className={`w-full rounded-3xl border p-4 text-left ${selectedId === row.id ? "border-primary bg-primary/[0.06]" : "bg-background hover:border-primary/40"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium break-all">{row.metadata?.title || row.redeem_key}</div>
                        <div className="mt-1 text-xs text-muted-foreground break-all">{row.redeem_key} • mode {row.reward_mode} • redeem {row.redeemed_count}/{row.max_redemptions}</div>
                      </div>
                      <Badge variant={row.enabled ? "outline" : "secondary"}>{row.enabled ? "Đang bật" : "Đã tắt"}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Hết hạn: {formatVietnameseDateTime(row.expires_at)} • Cập nhật: {formatVietnameseDateTime(row.updated_at)}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="basic" className="space-y-3">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-3xl border bg-background p-2">
              <TabsTrigger value="basic">Thông tin mã</TabsTrigger>
              <TabsTrigger value="limit">Giới hạn</TabsTrigger>
              <TabsTrigger value="reward">Phần thưởng & logic</TabsTrigger>
            </TabsList>

            <TabsContent value="basic">
              <Card>
                <CardHeader>
                  <CardTitle>Thông tin mã</CardTitle>
                  <CardDescription>“Gói quà” đã được chuyển khỏi tab Cấu hình app sang đây để quản lý đúng chỗ.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <Field label="Nhãn tab trong app"><Input value={giftTabLabel} onChange={(e) => setGiftTabLabel(e.target.value)} placeholder="Mã quà / Nhập mã quà" /></Field>
                  <Field label="Mã redeem"><Input value={draft.redeem_key} onChange={(e) => setDraft((p: any) => ({ ...p, redeem_key: e.target.value.toUpperCase() }))} /></Field>
                  <Field label="Tên gợi nhớ"><Input value={draft.title} onChange={(e) => setDraft((p: any) => ({ ...p, title: e.target.value }))} /></Field>
                  <div className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">Bật mã redeem</div>
                        <div className="text-sm text-muted-foreground">Tắt mã là server ngừng nhận ngay.</div>
                      </div>
                      <Switch checked={Boolean(draft.enabled)} onCheckedChange={(checked) => setDraft((p: any) => ({ ...p, enabled: checked }))} />
                    </div>
                  </div>
                  <Field label="Bắt đầu nhận"><Input type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft((p: any) => ({ ...p, starts_at: e.target.value }))} /></Field>
                  <Field label="Hết hạn"><Input type="datetime-local" value={draft.expires_at} onChange={(e) => setDraft((p: any) => ({ ...p, expires_at: e.target.value }))} /></Field>
                  <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground md:col-span-2">Hiển thị trong app phải rõ như người đọc: bắt đầu <span className="font-medium text-foreground">{formatVietnameseDateTime(fromDateTimeLocalValue(draft.starts_at))}</span> • hết hạn <span className="font-medium text-foreground">{formatVietnameseDateTime(fromDateTimeLocalValue(draft.expires_at))}</span></div>
                  <div className="md:col-span-2 space-y-2">
                    <Label>Ghi chú admin</Label>
                    <Textarea rows={4} value={draft.note} onChange={(e) => setDraft((p: any) => ({ ...p, note: e.target.value }))} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="limit">
              <Card>
                <CardHeader>
                  <CardTitle>Giới hạn sử dụng</CardTitle>
                  <CardDescription>Tách riêng tổng lượt, mỗi IP, mỗi device và mỗi tài khoản.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Tổng lượt redeem"><Input value={draft.max_redemptions} onChange={(e) => setDraft((p: any) => ({ ...p, max_redemptions: e.target.value }))} /></Field>
                  <Field label="Mỗi IP tối đa"><Input value={draft.max_redeems_per_ip} onChange={(e) => setDraft((p: any) => ({ ...p, max_redeems_per_ip: e.target.value }))} /></Field>
                  <Field label="Mỗi device tối đa"><Input value={draft.max_redeems_per_device} onChange={(e) => setDraft((p: any) => ({ ...p, max_redeems_per_device: e.target.value }))} /></Field>
                  <Field label="Mỗi tài khoản tối đa"><Input value={draft.max_redeems_per_account} onChange={(e) => setDraft((p: any) => ({ ...p, max_redeems_per_account: e.target.value }))} /></Field>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reward">
              <Card>
                <CardHeader>
                  <CardTitle>Plan, credit và logic áp dụng</CardTitle>
                  <CardDescription>Gói cao hơn áp dụng gói đó + credit. Gói thấp hơn thì giữ gói hiện tại + credit. Trùng gói mặc định chỉ cộng credit.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <Field label="Reward mode">
                    <Select value={draft.reward_mode} onValueChange={(value) => setDraft((p: any) => ({ ...p, reward_mode: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plan">Plan</SelectItem>
                        <SelectItem value="soft_credit">Credit thường</SelectItem>
                        <SelectItem value="premium_credit">Credit VIP</SelectItem>
                        <SelectItem value="mixed">Plan + credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Gói thưởng">
                    <Select value={draft.plan_code} onValueChange={(value) => setDraft((p: any) => ({ ...p, plan_code: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="go">Go</SelectItem>
                        <SelectItem value="plus">Plus</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Số ngày gói"><Input value={draft.entitlement_days} onChange={(e) => setDraft((p: any) => ({ ...p, entitlement_days: e.target.value }))} /></Field>
                  <Field label="Credit thường (có thể âm)"><Input value={draft.soft_credit_amount} onChange={(e) => setDraft((p: any) => ({ ...p, soft_credit_amount: e.target.value }))} /></Field>
                  <Field label="Credit VIP (có thể âm)"><Input value={draft.premium_credit_amount} onChange={(e) => setDraft((p: any) => ({ ...p, premium_credit_amount: e.target.value }))} /></Field>
                  <div className="space-y-3 rounded-2xl border p-4 md:col-span-2">
                    <ToggleRow title="Gói cao hơn thì áp dụng gói đó + credit" checked={Boolean(draft.apply_plan_if_higher)} onCheckedChange={(checked) => setDraft((p: any) => ({ ...p, apply_plan_if_higher: checked }))} />
                    <ToggleRow title="Gói thấp hơn thì giữ gói hiện tại + credit" checked={Boolean(draft.keep_higher_plan)} onCheckedChange={(checked) => setDraft((p: any) => ({ ...p, keep_higher_plan: checked }))} />
                    <ToggleRow title="Đúng gói thì mặc định chỉ cộng credit" checked={Boolean(draft.same_plan_credit_only)} onCheckedChange={(checked) => setDraft((p: any) => ({ ...p, same_plan_credit_only: checked }))} />
                    <ToggleRow title="Cho phép gia hạn nếu trùng gói" checked={Boolean(draft.allow_same_plan_extension)} onCheckedChange={(checked) => setDraft((p: any) => ({ ...p, allow_same_plan_extension: checked }))} />
                    <ToggleRow title="Nếu ngày của mã thấp hơn mức đang có thì không lấy ngày đó" checked={Boolean(draft.apply_days_only_if_greater)} onCheckedChange={(checked) => setDraft((p: any) => ({ ...p, apply_days_only_if_greater: checked }))} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Gift className="h-5 w-5 text-primary" />Preview logic</CardTitle>
              <CardDescription>Tóm tắt đúng rule bạn chốt cho mã đang chọn.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {preview.map((item) => (
                <div key={item} className="rounded-2xl border p-3">{item}</div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Checklist UI bước cuối</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <MiniLine icon={<ShieldCheck className="h-4 w-4" />} text="Giới hạn IP / device / account được lưu riêng cho từng redeem key, không còn dính free admin." />
              <MiniLine icon={<Sparkles className="h-4 w-4" />} text="Ngày kích hoạt, hết hạn và ngày gia hạn phải hiển thị kiểu 02 tháng 07 năm 2026, không lòi ISO thô." />
              <MiniLine icon={<TicketPercent className="h-4 w-4" />} text="Giá popup 1 / 7 / 30 ngày được chỉnh ở tab Charge, còn nhãn “gói quà” đã chuyển sang đây." />
              <Separator />
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || query.isFetching}>Lưu Create Redeem</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MiniLine({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex items-start gap-2 rounded-2xl border p-3 text-muted-foreground">{icon}<span>{text}</span></div>;
}

function ToggleRow({ title, checked, onCheckedChange }: { title: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3">
      <div className="text-sm font-medium">{title}</div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
