import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Gift, RefreshCw, Search, ShieldCheck, Sparkles, TicketPercent, Trash2, WandSparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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

function isFreeFlowRedeem(row: any) {
  const source = String(row?.metadata?.source || "").trim().toLowerCase();
  const note = String(row?.notes || "").trim().toUpperCase();
  return Boolean(row?.source_free_session_id) || source === "free-flow" || note.includes("FREE_FLOW");
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
  blocked_at: null,
  blocked_reason: "",
  source_free_session_id: null,
  trace_id: null,
  metadata: {},
};

export function AdminServerAppRedeemPage() {
  const { appCode = "find-dumps" } = useParams();
  const { toast } = useToast();
  const sb = supabase as any;
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<any>(EMPTY_DRAFT);
  const [giftTabLabel, setGiftTabLabel] = useState("Mã quà");
  const [adminSearch, setAdminSearch] = useState("");
  const [freeSearch, setFreeSearch] = useState("");

  const query = useQuery({
    queryKey: ["server-app-redeem-admin", appCode],
    enabled: appCode === "find-dumps",
    queryFn: async () => {
      const [keysRes, settingsRes] = await Promise.all([
        sb.from("server_app_redeem_keys").select("*").eq("app_code", appCode).order("created_at", { ascending: false }).limit(300),
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
    const activeStillExists = query.data.keys.some((row: any) => String(row.id) === String(selectedId || ""));
    if ((!selectedId || !activeStillExists) && first) {
      setSelectedId(String(first.id));
      hydrateDraft(first);
      return;
    }
    if (!query.data.keys.length) {
      setSelectedId("");
      setDraft({ ...EMPTY_DRAFT, redeem_key: randomRedeemCode() });
    }
  }, [query.data, selectedId]);

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
      blocked_at: row.blocked_at || null,
      blocked_reason: String(row.blocked_reason || ""),
      source_free_session_id: row.source_free_session_id || null,
      trace_id: row.trace_id || null,
      metadata: row.metadata || {},
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        id: draft.id || undefined,
        app_code: appCode,
        reward_package_id: null,
        source_free_session_id: draft.source_free_session_id || null,
        trace_id: draft.trace_id || null,
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
        blocked_at: draft.blocked_at || null,
        blocked_reason: String(draft.blocked_reason || "").trim() || null,
        metadata: {
          ...(draft.metadata || {}),
          source: isFreeFlowRedeem(draft) ? "free-flow" : "admin-create-redeem",
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

  const statusMutation = useMutation({
    mutationFn: async ({ row, action }: { row: any; action: "block" | "unblock" | "delete" }) => {
      const key = String(row?.redeem_key || draft?.redeem_key || "").trim();
      if (!key) throw new Error("MISSING_REDEEM_KEY");
      if (action === "delete") {
        const del = await sb.from("server_app_redeem_keys").delete().eq("id", row.id);
        if (del.error) throw del.error;
      } else if (action === "block") {
        const upd = await sb.from("server_app_redeem_keys").update({
          enabled: false,
          blocked_at: new Date().toISOString(),
          blocked_reason: "admin_manual_block",
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (upd.error) throw upd.error;
      } else {
        const upd = await sb.from("server_app_redeem_keys").update({
          enabled: true,
          blocked_at: null,
          blocked_reason: null,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (upd.error) throw upd.error;
      }
      await insertAdminAuditLog({ appCode, targetKind: "redeem", targetValue: key, action: `redeem_${action}`, payload: { id: row.id, redeem_key: key } });
      await insertRuntimeAdminEvent({ appCode, code: `ADMIN_REDEEM_${action.toUpperCase()}`, message: `Admin ${action} redeem ${key}`, meta: { redeem_key: key } });
      return action;
    },
    onSuccess: async (action: any, vars: any) => {
      await query.refetch();
      if (action === "delete" && String(vars?.row?.id || "") === selectedId) {
        setSelectedId("");
        setDraft({ ...EMPTY_DRAFT, redeem_key: randomRedeemCode() });
      }
      toast({ title: "Đã cập nhật mã", description: action === "delete" ? "Mã đã bị xóa." : action === "block" ? "Mã đã bị khóa." : "Mã đã được mở lại." });
    },
    onError: (error: any) => toast({ title: "Không cập nhật được mã", description: error?.message || "Kiểm tra lại trạng thái mã redeem.", variant: "destructive" }),
  });

  const preview = useMemo(() => {
    const plan = String(draft.plan_code || "go").toUpperCase();
    return [
      `Tổng lượt redeem: ${draft.max_redemptions || 1} • IP tối đa ${draft.max_redeems_per_ip || 0} • device tối đa ${draft.max_redeems_per_device || 0} • tài khoản tối đa ${draft.max_redeems_per_account || 0}.`,
      `Nếu user đang có gói thấp hơn ${plan} thì áp dụng gói ${plan} + credit của mã.`,
      draft.keep_higher_plan
        ? `Nếu user đang có gói cao hơn thì giữ gói hiện tại và chỉ cộng credit, không hạ gói.`
        : `Nếu tắt giữ gói cao hơn, admin đang cho phép mã ép lại gói được khai báo.`,
      draft.same_plan_credit_only
        ? `Nếu user đang có đúng gói ${plan} thì mặc định chỉ cộng credit.`
        : `Nếu tắt credit-only khi trùng gói, mã này có thể động vào phần ngày hạn khi admin cho phép.`,
      draft.allow_same_plan_extension
        ? `Admin đã bật “cho phép gia hạn nếu trùng gói”. Nếu số ngày của mã cao hơn và toggle ngày lớn hơn đang bật thì server mới cộng thêm ngày.`
        : `Trùng gói sẽ không tự cộng thêm ngày.`,
      draft.apply_days_only_if_greater
        ? `Nếu số ngày của mã thấp hơn mức đang có thì không lấy ngày đó.`
        : `Admin đang cho phép áp ngày mới kể cả khi ngày thấp hơn, nên cần dùng rất cẩn thận.`,
      `Credit thường: ${draft.soft_credit_amount} • VIP: ${draft.premium_credit_amount}. Admin vẫn có thể tạo credit âm để phạt nợ, nhưng runtime sẽ chặn tiêu hao tiếp khi ví đang âm.`,
    ];
  }, [draft]);

  const grouped = useMemo(() => {
    const allKeys = query.data?.keys || [];
    const adminKeys = allKeys.filter((row: any) => !isFreeFlowRedeem(row));
    const freeKeys = allKeys.filter((row: any) => isFreeFlowRedeem(row));
    const match = (row: any, q: string) => {
      const needle = String(q || "").trim().toLowerCase();
      if (!needle) return true;
      const hay = [row?.redeem_key, row?.title, row?.notes, row?.metadata?.title, row?.metadata?.note, row?.trace_id, row?.source_free_session_id]
        .map((item: any) => String(item || "").toLowerCase())
        .join(" • ");
      return hay.includes(needle);
    };
    return {
      adminKeys,
      freeKeys,
      filteredAdmin: adminKeys.filter((row: any) => match(row, adminSearch)),
      filteredFree: freeKeys.filter((row: any) => match(row, freeSearch)),
    };
  }, [query.data, adminSearch, freeSearch]);

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
            Gộp thông tin mã + giới hạn + phần thưởng vào một nơi cho dễ chỉnh. Danh sách mã phía dưới được chia tách rõ giữa mã admin tạo và key free đẩy từ /free.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Chỉnh mã đang chọn</CardTitle>
                <CardDescription>Không chia 3 tab nữa. Tất cả nằm cùng một khu để chỉnh nhanh và đỡ sót.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => { setSelectedId(""); setDraft({ ...EMPTY_DRAFT, redeem_key: randomRedeemCode() }); }}><WandSparkles className="mr-2 h-4 w-4" />Tạo mã mới</Button>
                <Button type="button" variant="outline" onClick={() => setDraft((prev: any) => ({ ...prev, redeem_key: randomRedeemCode() }))}><RefreshCw className="mr-2 h-4 w-4" />Random code</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-primary"><Gift className="h-4 w-4" /> Thông tin mã</div>
              <div className="grid gap-4 md:grid-cols-2">
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
                <div className="md:col-span-2 rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">Hiển thị trong app phải rõ như người đọc: bắt đầu <span className="font-medium text-foreground">{formatVietnameseDateTime(fromDateTimeLocalValue(draft.starts_at))}</span> • hết hạn <span className="font-medium text-foreground">{formatVietnameseDateTime(fromDateTimeLocalValue(draft.expires_at))}</span></div>
                <div className="md:col-span-2 space-y-2">
                  <Label>Ghi chú admin</Label>
                  <Textarea rows={4} value={draft.note} onChange={(e) => setDraft((p: any) => ({ ...p, note: e.target.value }))} />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="h-4 w-4" /> Giới hạn</div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Tổng lượt redeem"><Input value={draft.max_redemptions} onChange={(e) => setDraft((p: any) => ({ ...p, max_redemptions: e.target.value }))} /></Field>
                <Field label="Mỗi IP tối đa"><Input value={draft.max_redeems_per_ip} onChange={(e) => setDraft((p: any) => ({ ...p, max_redeems_per_ip: e.target.value }))} /></Field>
                <Field label="Mỗi device tối đa"><Input value={draft.max_redeems_per_device} onChange={(e) => setDraft((p: any) => ({ ...p, max_redeems_per_device: e.target.value }))} /></Field>
                <Field label="Mỗi tài khoản tối đa"><Input value={draft.max_redeems_per_account} onChange={(e) => setDraft((p: any) => ({ ...p, max_redeems_per_account: e.target.value }))} /></Field>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-primary"><Sparkles className="h-4 w-4" /> Phần thưởng & logic</div>
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
            </section>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button className="min-w-40" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || query.isFetching}>Lưu Create Redeem</Button>
              {selectedId ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!window.confirm(draft.blocked_at ? "Mở lại mã này?" : "Khóa mã này?")) return;
                      statusMutation.mutate({ row: { id: selectedId, redeem_key: draft.redeem_key }, action: draft.blocked_at ? "unblock" : "block" });
                    }}
                    disabled={statusMutation.isPending}
                  >
                    {draft.blocked_at ? "Mở lại" : "Khóa / block"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      if (!window.confirm(`Xóa hẳn mã ${draft.redeem_key}?`)) return;
                      statusMutation.mutate({ row: { id: selectedId, redeem_key: draft.redeem_key }, action: "delete" });
                    }}
                    disabled={statusMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />Xóa mã
                  </Button>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>

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
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RedeemListCard
          title="Mã admin tạo"
          description="Mã được tạo trực tiếp trong Create Redeem để quản lý, block hoặc xóa nhanh."
          search={adminSearch}
          onSearchChange={setAdminSearch}
          rows={grouped.filteredAdmin}
          selectedId={selectedId}
          onSelect={(row) => { setSelectedId(String(row.id)); hydrateDraft(row); }}
          onToggleBlock={(row) => {
            if (!window.confirm(row.blocked_at ? `Mở lại mã ${row.redeem_key}?` : `Khóa mã ${row.redeem_key}?`)) return;
            statusMutation.mutate({ row, action: row.blocked_at ? "unblock" : "block" });
          }}
          onDelete={(row) => {
            if (!window.confirm(`Xóa hẳn mã ${row.redeem_key}?`)) return;
            statusMutation.mutate({ row, action: "delete" });
          }}
        />

        <RedeemListCard
          title="Key free từ mityangho.id.vn/free"
          description="Các key được đẩy từ luồng free. Tại đây admin dễ tìm lại để block, xóa hoặc soi trace."
          search={freeSearch}
          onSearchChange={setFreeSearch}
          rows={grouped.filteredFree}
          selectedId={selectedId}
          onSelect={(row) => { setSelectedId(String(row.id)); hydrateDraft(row); }}
          onToggleBlock={(row) => {
            if (!window.confirm(row.blocked_at ? `Mở lại mã ${row.redeem_key}?` : `Khóa mã ${row.redeem_key}?`)) return;
            statusMutation.mutate({ row, action: row.blocked_at ? "unblock" : "block" });
          }}
          onDelete={(row) => {
            if (!window.confirm(`Xóa hẳn mã ${row.redeem_key}?`)) return;
            statusMutation.mutate({ row, action: "delete" });
          }}
        />
      </div>
    </section>
  );
}

function RedeemListCard({
  title,
  description,
  search,
  onSearchChange,
  rows,
  selectedId,
  onSelect,
  onToggleBlock,
  onDelete,
}: {
  title: string;
  description: string;
  search: string;
  onSearchChange: (value: string) => void;
  rows: any[];
  selectedId: string;
  onSelect: (row: any) => void;
  onToggleBlock: (row: any) => void;
  onDelete: (row: any) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Tìm theo mã, tiêu đề, trace, session..." className="pl-10" />
        </div>
        <div className="grid gap-3">
          {rows.map((row: any) => (
            <div key={row.id} className={`w-full rounded-3xl border p-4 text-left ${selectedId === row.id ? "border-primary bg-primary/[0.06]" : "bg-background hover:border-primary/40"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button type="button" onClick={() => onSelect(row)} className="min-w-0 flex-1 text-left">
                  <div className="font-medium break-all">{row.title || row.metadata?.title || row.redeem_key}</div>
                  <div className="mt-1 text-xs text-muted-foreground break-all">{row.redeem_key} • mode {row.reward_mode} • redeem {row.redeemed_count}/{row.max_redemptions}</div>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={row.blocked_at ? "destructive" : row.enabled ? "outline" : "secondary"}>{row.blocked_at ? "Đã block" : row.enabled ? "Đang bật" : "Đã tắt"}</Badge>
                  <Button size="sm" type="button" variant="outline" onClick={() => onToggleBlock(row)}>{row.blocked_at ? "Mở lại" : "Block"}</Button>
                  <Button size="sm" type="button" variant="destructive" onClick={() => onDelete(row)}>Xóa</Button>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Hết hạn: {formatVietnameseDateTime(row.expires_at)} • Cập nhật: {formatVietnameseDateTime(row.updated_at)}</div>
            </div>
          ))}
          {!rows.length ? <div className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">Không có mã nào khớp bộ lọc hiện tại.</div> : null}
        </div>
      </CardContent>
    </Card>
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
