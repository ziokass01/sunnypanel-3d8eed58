import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AlertTriangle, Ban, CreditCard, Lock, LockOpen, Mail, Search, ShieldCheck, Smartphone, Trash2, UserRoundCheck } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
import { addDaysIso, formatVietnameseDateTime, fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/dateFormat";
import { asNumber, insertAdminAuditLog, insertRuntimeAdminEvent, planRank, uniqueStrings } from "@/lib/serverAppAdmin";

type ScanMode = "gmail" | "ip" | "device" | "user_id";

type Candidate = {
  accountRef: string;
  source: string[];
  devices: string[];
  lastSeenAt: string | null;
  activePlan: string;
  sessionCount: number;
};

type PendingAction = {
  kind: "ban" | "lock" | "unlock" | "delete" | "wipe_expiry" | "save_account" | "save_features";
  title: string;
  description: string;
};

const EMPTY_ACCOUNT = {
  accountRef: "",
  currentPlan: "classic",
  entitlementId: "",
  expiresAt: "",
  softBalance: "0",
  premiumBalance: "0",
  deviceId: "",
  firstSeenIp: "",
  lastSeenIp: "",
  note: "",
  banned: false,
  locked: false,
};

export function AdminServerAppControlPage() {
  const { appCode = "find-dumps" } = useParams();
  const { toast } = useToast();
  const sb = supabase as any;
  const [scanMode, setScanMode] = useState<ScanMode>("gmail");
  const [query, setQuery] = useState("");
  const [scanToken, setScanToken] = useState(0);
  const [confirmedAccountRef, setConfirmedAccountRef] = useState("");
  const [accountDraft, setAccountDraft] = useState<any>(EMPTY_ACCOUNT);
  const [featureDrafts, setFeatureDrafts] = useState<any[]>([]);
  const [reasonDraft, setReasonDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const scanQuery = useQuery({
    queryKey: ["server-app-control-scan", appCode, scanMode, query, scanToken],
    enabled: appCode === "find-dumps" && scanToken > 0 && Boolean(query.trim()),
    queryFn: async () => {
      const q = query.trim();
      const accountRefs = new Set<string>();
      const candidateMap = new Map<string, Candidate>();
      const note = (accountRef: string, partial?: Partial<Candidate>) => {
        if (!accountRef) return;
        const current = candidateMap.get(accountRef) || {
          accountRef,
          source: [],
          devices: [],
          lastSeenAt: null,
          activePlan: "classic",
          sessionCount: 0,
        };
        candidateMap.set(accountRef, {
          ...current,
          ...partial,
          source: uniqueStrings([...(current.source || []), ...((partial?.source as string[]) || [])]),
          devices: uniqueStrings([...(current.devices || []), ...((partial?.devices as string[]) || [])]),
          lastSeenAt: partial?.lastSeenAt && (!current.lastSeenAt || new Date(partial.lastSeenAt).getTime() > new Date(current.lastSeenAt).getTime())
            ? partial.lastSeenAt
            : current.lastSeenAt,
          sessionCount: Math.max(current.sessionCount || 0, partial?.sessionCount || 0),
        });
        accountRefs.add(accountRef);
      };

      if (scanMode === "gmail" || scanMode === "user_id") {
        const [walletRes, sessionRes, entitlementRes] = await Promise.all([
          sb.from("server_app_wallet_balances").select("account_ref,device_id,updated_at").eq("app_code", appCode).ilike("account_ref", `%${q}%`).limit(25),
          sb.from("server_app_sessions").select("account_ref,device_id,last_seen_at,status").eq("app_code", appCode).ilike("account_ref", `%${q}%`).limit(25),
          sb.from("server_app_entitlements").select("account_ref,plan_code,expires_at,status").eq("app_code", appCode).ilike("account_ref", `%${q}%`).limit(25),
        ]);
        [walletRes.data || [], sessionRes.data || [], entitlementRes.data || []].flat().forEach((row: any) => {
          note(String(row.account_ref || ""), {
            source: [scanMode],
            devices: row.device_id ? [String(row.device_id)] : [],
            lastSeenAt: row.last_seen_at || row.updated_at || row.expires_at || null,
            activePlan: row.plan_code || undefined,
          });
        });
      }

      if (scanMode === "device") {
        const [deviceRes, sessionRes] = await Promise.all([
          sb.from("server_app_runtime_device_accounts").select("account_ref,device_id,last_seen_at").eq("app_code", appCode).ilike("device_id", `%${q}%`).limit(30),
          sb.from("server_app_sessions").select("account_ref,device_id,last_seen_at,status").eq("app_code", appCode).ilike("device_id", `%${q}%`).limit(30),
        ]);
        [deviceRes.data || [], sessionRes.data || []].flat().forEach((row: any) => {
          note(String(row.account_ref || ""), {
            source: ["device"],
            devices: row.device_id ? [String(row.device_id)] : [],
            lastSeenAt: row.last_seen_at || null,
          });
        });
      }

      if (scanMode === "ip") {
        const [bucketRes, bindingRes] = await Promise.all([
          sb.from("server_app_runtime_counter_buckets").select("subject_value,last_seen_at").eq("app_code", appCode).eq("subject_kind", "ip").ilike("subject_value", `%${q}%`).limit(20),
          sb.from("server_app_runtime_account_bindings").select("account_ref,first_ip_hash,last_ip_hash,updated_at").eq("app_code", appCode).or(`first_ip_hash.ilike.%${q}%,last_ip_hash.ilike.%${q}%`).limit(30),
        ]);
        (bindingRes.data || []).forEach((row: any) => {
          note(String(row.account_ref || ""), {
            source: ["ip"],
            lastSeenAt: row.updated_at || null,
          });
        });
        if (!(bindingRes.data || []).length && (bucketRes.data || []).length) {
          return { candidates: [], ipOnlyHint: true };
        }
      }

      if (!accountRefs.size) {
        return { candidates: [], ipOnlyHint: scanMode === "ip" };
      }

      const refs = Array.from(accountRefs);
      const [sessionStatsRes, entitlementRes] = await Promise.all([
        sb.from("server_app_sessions").select("account_ref,device_id,last_seen_at,status").eq("app_code", appCode).in("account_ref", refs).limit(200),
        sb.from("server_app_entitlements").select("account_ref,plan_code,expires_at,status,updated_at").eq("app_code", appCode).in("account_ref", refs).order("updated_at", { ascending: false }).limit(200),
      ]);
      const sessionRows = sessionStatsRes.data || [];
      const entitlementRows = entitlementRes.data || [];
      refs.forEach((accountRef) => {
        const accountSessions = sessionRows.filter((row: any) => row.account_ref === accountRef);
        const activeEntitlement = entitlementRows.find((row: any) => row.account_ref === accountRef && row.status === "active") || entitlementRows.find((row: any) => row.account_ref === accountRef);
        note(accountRef, {
          sessionCount: accountSessions.length,
          devices: accountSessions.map((row: any) => String(row.device_id || "")).filter(Boolean),
          lastSeenAt: accountSessions[0]?.last_seen_at || activeEntitlement?.updated_at || null,
          activePlan: activeEntitlement?.plan_code || "classic",
        });
      });

      return {
        candidates: Array.from(candidateMap.values()).sort((a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime()),
        ipOnlyHint: false,
      };
    },
  });

  const detailQuery = useQuery({
    queryKey: ["server-app-control-detail", appCode, confirmedAccountRef],
    enabled: Boolean(confirmedAccountRef),
    queryFn: async () => {
      const [walletRes, entitlementRes, sessionsRes, unlockRulesRes, unlocksRes, bindingRes, controlsRes, auditRes] = await Promise.all([
        sb.from("server_app_wallet_balances").select("*").eq("app_code", appCode).eq("account_ref", confirmedAccountRef).maybeSingle(),
        sb.from("server_app_entitlements").select("*").eq("app_code", appCode).eq("account_ref", confirmedAccountRef).order("updated_at", { ascending: false }).limit(10),
        sb.from("server_app_sessions").select("*").eq("app_code", appCode).eq("account_ref", confirmedAccountRef).order("last_seen_at", { ascending: false }).limit(10),
        sb.from("server_app_feature_unlock_rules").select("*").eq("app_code", appCode).order("sort_order", { ascending: true }),
        sb.from("server_app_feature_unlocks").select("*").eq("app_code", appCode).eq("account_ref", confirmedAccountRef).order("updated_at", { ascending: false }),
        sb.from("server_app_runtime_account_bindings").select("*").eq("app_code", appCode).eq("account_ref", confirmedAccountRef).maybeSingle(),
        sb.from("server_app_runtime_controls").select("blocked_accounts").eq("app_code", appCode).maybeSingle(),
        sb.from("server_app_admin_audit_logs").select("*").eq("app_code", appCode).eq("account_ref", confirmedAccountRef).order("created_at", { ascending: false }).limit(8),
      ]);
      if (walletRes.error) throw walletRes.error;
      if (entitlementRes.error) throw entitlementRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (unlockRulesRes.error) throw unlockRulesRes.error;
      if (unlocksRes.error) throw unlocksRes.error;
      if (bindingRes.error) throw bindingRes.error;
      if (controlsRes.error) throw controlsRes.error;
      if (auditRes.error) throw auditRes.error;
      return {
        wallet: walletRes.data,
        entitlements: entitlementRes.data || [],
        sessions: sessionsRes.data || [],
        unlockRules: unlockRulesRes.data || [],
        unlocks: unlocksRes.data || [],
        binding: bindingRes.data || null,
        controls: controlsRes.data || null,
        audits: auditRes.data || [],
      };
    },
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    const activeEntitlement = detailQuery.data.entitlements.find((row: any) => row.status === "active") || detailQuery.data.entitlements[0] || null;
    const blockedAccounts = Array.isArray(detailQuery.data.controls?.blocked_accounts) ? detailQuery.data.controls.blocked_accounts : [];
    setAccountDraft({
      accountRef: confirmedAccountRef,
      currentPlan: String(activeEntitlement?.plan_code || "classic"),
      entitlementId: String(activeEntitlement?.id || ""),
      expiresAt: toDateTimeLocalValue(activeEntitlement?.expires_at || null),
      softBalance: String(detailQuery.data.wallet?.soft_balance ?? 0),
      premiumBalance: String(detailQuery.data.wallet?.premium_balance ?? 0),
      deviceId: String(detailQuery.data.binding?.last_device_id || detailQuery.data.sessions?.[0]?.device_id || ""),
      firstSeenIp: String(detailQuery.data.binding?.first_ip_hash || ""),
      lastSeenIp: String(detailQuery.data.binding?.last_ip_hash || ""),
      note: "",
      banned: blockedAccounts.includes(confirmedAccountRef),
      locked: Boolean(detailQuery.data.binding?.locked_at && !detailQuery.data.binding?.locked_until),
    });
    const activeUnlockCodes = new Set((detailQuery.data.unlocks || []).filter((row: any) => row.status === "active").map((row: any) => String(row.access_code || "")));
    setFeatureDrafts((detailQuery.data.unlockRules || []).map((rule: any) => ({
      accessCode: String(rule.access_code || ""),
      title: String(rule.title || rule.access_code || ""),
      enabled: activeUnlockCodes.has(String(rule.access_code || "")),
      expiresAt: toDateTimeLocalValue((detailQuery.data.unlocks || []).find((row: any) => row.access_code === rule.access_code && row.status === "active")?.expires_at || null),
      guardedFeatureCodes: Array.isArray(rule.guarded_feature_codes) ? rule.guarded_feature_codes : [],
    })));
  }, [detailQuery.data, confirmedAccountRef]);

  const saveAccountMutation = useMutation({
    mutationFn: async () => {
      const accountRef = confirmedAccountRef;
      const softBalance = asNumber(accountDraft.softBalance);
      const premiumBalance = asNumber(accountDraft.premiumBalance);
      const expiresAtIso = fromDateTimeLocalValue(accountDraft.expiresAt);

      const walletPayload = {
        app_code: appCode,
        account_ref: accountRef,
        device_id: accountDraft.deviceId || null
        soft_balance: softBalance,
        premium_balance: premiumBalance,
        updated_by_source: "admin_control",
        metadata: { updated_from: "control_center" },
      };
      const walletWrite = await sb.from("server_app_wallet_balances").upsert(walletPayload, { onConflict: "app_code,account_ref" });
      if (walletWrite.error) throw walletWrite.error;

      const balanceAfterRes = await sb.from("server_app_wallet_balances").select("id,soft_balance,premium_balance").eq("app_code", appCode).eq("account_ref", accountRef).maybeSingle();
      if (balanceAfterRes.error) throw balanceAfterRes.error;

      const entitlementPayload = {
        app_code: appCode,
        account_ref: accountRef,
        device_id: accountDraft.deviceId || null
        plan_code: accountDraft.currentPlan,
        starts_at: new Date().toISOString(),
        expires_at: expiresAtIso,
        source_type: accountDraft.entitlementId ? undefined : "admin_grant",
        status: "active",
        metadata: {
          updated_from: "control_center",
          first_seen_ip: accountDraft.firstSeenIp || null,
          last_seen_ip: accountDraft.lastSeenIp || null,
        },
      };
      let entitlementWrite;
      if (accountDraft.entitlementId) {
        entitlementWrite = await sb.from("server_app_entitlements").update(entitlementPayload).eq("id", accountDraft.entitlementId);
      } else {
        entitlementWrite = await sb.from("server_app_entitlements").insert(entitlementPayload);
      }
      if (entitlementWrite.error) throw entitlementWrite.error;

      const txWrite = await sb.from("server_app_wallet_transactions").insert({
        app_code: appCode,
        wallet_balance_id: balanceAfterRes.data?.id || null,
        account_ref: accountRef,
        device_id: accountDraft.deviceId || null
        transaction_type: "admin_adjust",
        wallet_kind: "mixed",
        soft_delta: softBalance,
        premium_delta: premiumBalance,
        soft_balance_after: balanceAfterRes.data?.soft_balance ?? softBalance,
        premium_balance_after: balanceAfterRes.data?.premium_balance ?? premiumBalance,
        note: reasonDraft || "Admin chỉnh ví/gói ở Trung tâm điều khiển",
        metadata: { plan_code: accountDraft.currentPlan, expires_at: expiresAtIso },
      });
      if (txWrite.error) throw txWrite.error;

      await insertAdminAuditLog({
        appCode,
        accountRef,
        action: "save_account_control",
        reason: reasonDraft,
        payload: {
          softBalance,
          premiumBalance,
          currentPlan: accountDraft.currentPlan,
          expiresAt: expiresAtIso,
        },
      });
      await insertRuntimeAdminEvent({
        appCode,
        accountRef,
        deviceId: accountDraft.deviceId || null,
        code: "ADMIN_ACCOUNT_UPDATE",
        message: `Admin cập nhật ví và gói cho ${accountRef}`,
        meta: { expiresAt: expiresAtIso, currentPlan: accountDraft.currentPlan },
      });
    },
    onSuccess: async () => {
      await detailQuery.refetch();
      setPendingAction(null);
      toast({ title: "Đã lưu ví / gói / hạn", description: "Ví thường, ví VIP, gói hiện tại và ngày hết hạn đã được cập nhật." });
    },
    onError: (error: any) => toast({ title: "Không lưu được", description: error?.message || "Kiểm tra lại bảng wallet / entitlements.", variant: "destructive" }),
  });

  const saveFeaturesMutation = useMutation({
    mutationFn: async () => {
      const accountRef = confirmedAccountRef;
      const activeMap = new Map((detailQuery.data?.unlocks || []).filter((row: any) => row.status === "active").map((row: any) => [String(row.access_code || ""), row]));
      for (const feature of featureDrafts) {
        const active = activeMap.get(feature.accessCode);
        const rule = (detailQuery.data?.unlockRules || []).find((row: any) => row.access_code === feature.accessCode);
        const expiresAt = fromDateTimeLocalValue(feature.expiresAt) || new Date(Date.now() + asNumber(rule?.unlock_duration_seconds, 86400) * 1000).toISOString();
        const traceId = `admin-${Date.now()}-${String(feature.accessCode || "feature")}`;
        if (feature.enabled && !active) {
          const createRes = await sb.from("server_app_feature_unlocks").insert({
            app_code: appCode,
            access_code: feature.accessCode,
            account_ref: accountRef,
            device_id: null,// account-wide unlock
            status: "active",
            unlock_source: "admin_grant",
            started_at: new Date().toISOString(),
            expires_at: expiresAt,
            trace_id: traceId,
            metadata: {
              updated_from: "control_center",
              admin_reason: reasonDraft || null,
              guarded_features: feature.guardedFeatureCodes,
            },
          });
          if (createRes.error) throw createRes.error;
        }
        if (feature.enabled && active) {
          // V8 hotfix: trước đây chỉ insert khi chưa có active unlock, nên chỉnh ngày gia hạn
          // ở web xong lưu lại sẽ bị refetch trả về ngày cũ. Active unlock phải được update
          // expires_at/status/device/metadata ngay cả khi switch đang bật sẵn.
          const updateRes = await sb.from("server_app_feature_unlocks").update({
            device_id: null,// account-wide unlock
            status: "active",
            revoked_at: null,
            expires_at: expiresAt,
            trace_id: traceId,
            metadata: {
              ...(typeof active.metadata === "object" && active.metadata ? active.metadata : {}),
              updated_from: "control_center",
              admin_reason: reasonDraft || null,
              guarded_features: feature.guardedFeatureCodes,
              previous_expires_at: active.expires_at || null,
            },
            updated_at: new Date().toISOString(),
          }).eq("id", active.id);
          if (updateRes.error) throw updateRes.error;
        }
        if (!feature.enabled && active) {
          const revokeRes = await sb.from("server_app_feature_unlocks").update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", active.id);
          if (revokeRes.error) throw revokeRes.error;
        }
      }
      await insertAdminAuditLog({
        appCode,
        accountRef,
        action: "save_feature_unlocks",
        reason: reasonDraft,
        payload: { features: featureDrafts },
      });
    },
    onSuccess: async () => {
      await detailQuery.refetch();
      setPendingAction(null);
      toast({ title: "Đã lưu feature", description: "Các nút mở khóa / khóa lại feature đã được đồng bộ." });
    },
    onError: (error: any) => toast({ title: "Không lưu được feature", description: error?.message || "Kiểm tra bảng server_app_feature_unlocks.", variant: "destructive" }),
  });

  const disciplineMutation = useMutation({
    mutationFn: async (kind: PendingAction["kind"]) => {
      const accountRef = confirmedAccountRef;
      if (kind === "ban") {
        const controlsRes = await sb.from("server_app_runtime_controls").select("blocked_accounts").eq("app_code", appCode).maybeSingle();
        if (controlsRes.error) throw controlsRes.error;
        const blocked = uniqueStrings([...(controlsRes.data?.blocked_accounts || []), accountRef]);
        const write = await sb.from("server_app_runtime_controls").upsert({ app_code: appCode, blocked_accounts: blocked }, { onConflict: "app_code" });
        if (write.error) throw write.error;
      }
      if (kind === "lock") {
        const write = await sb.from("server_app_runtime_account_bindings").upsert({
          app_code: appCode,
          account_ref: accountRef,
          first_device_id: accountDraft.deviceId || null
          last_device_id: accountDraft.deviceId || null
          first_ip_hash: accountDraft.firstSeenIp || null,
          last_ip_hash: accountDraft.lastSeenIp || null,
          locked_at: new Date().toISOString(),
          locked_until: null,
          lock_reason: reasonDraft || "Admin khóa đăng nhập",
          metadata: { updated_from: "control_center" },
        }, { onConflict: "app_code,account_ref" });
        if (write.error) throw write.error;
      }
      if (kind === "unlock") {
        const write = await sb.from("server_app_runtime_account_bindings").upsert({
          app_code: appCode,
          account_ref: accountRef,
          first_device_id: accountDraft.deviceId || null
          last_device_id: accountDraft.deviceId || null
          first_ip_hash: accountDraft.firstSeenIp || null,
          last_ip_hash: accountDraft.lastSeenIp || null,
          locked_at: null,
          locked_until: null,
          lock_reason: null,
          metadata: { updated_from: "control_center" },
        }, { onConflict: "app_code,account_ref" });
        if (write.error) throw write.error;
      }
      if (kind === "delete") {
        const ops = await Promise.all([
          sb.from("server_app_feature_unlocks").delete().eq("app_code", appCode).eq("account_ref", accountRef),
          sb.from("server_app_sessions").delete().eq("app_code", appCode).eq("account_ref", accountRef),
          sb.from("server_app_entitlements").delete().eq("app_code", appCode).eq("account_ref", accountRef),
          sb.from("server_app_wallet_balances").delete().eq("app_code", appCode).eq("account_ref", accountRef),
        ]);
        const err = ops.find((item: any) => item.error)?.error;
        if (err) throw err;
      }
      if (kind === "wipe_expiry") {
        if (!accountDraft.entitlementId) return;
        const write = await sb.from("server_app_entitlements").update({ expires_at: null }).eq("id", accountDraft.entitlementId);
        if (write.error) throw write.error;
      }
      await insertAdminAuditLog({
        appCode,
        accountRef,
        action: `discipline_${kind}`,
        reason: reasonDraft,
        payload: { accountRef, deviceId: accountDraft.deviceId || null },
      });
      await insertRuntimeAdminEvent({ appCode, accountRef, deviceId: accountDraft.deviceId || null, code: `ADMIN_${kind.toUpperCase()}`, message: `Admin thao tác ${kind} cho ${accountRef}`, meta: { reason: reasonDraft || null } });
    },
    onSuccess: async () => {
      await detailQuery.refetch();
      setPendingAction(null);
      toast({ title: "Đã thực hiện thao tác nặng", description: "Audit log đã được ghi lại cho thao tác này." });
    },
    onError: (error: any) => toast({ title: "Thao tác không thành công", description: error?.message || "Vui lòng kiểm tra lại dữ liệu tài khoản.", variant: "destructive" }),
  });

  const scanSummary = useMemo(() => {
    if (!query.trim()) return "Nhập Gmail / account_ref, IP hash hoặc device id rồi bấm Quét.";
    if (scanQuery.isFetching) return "Đang quét tài khoản...";
    if (!scanQuery.data?.candidates?.length) {
      return scanQuery.data?.ipOnlyHint
        ? "Không có tài khoản map trực tiếp theo IP thô. Nếu runtime đang lưu IP hash, hãy dán đúng hash hoặc thử quét bằng Gmail / device."
        : "Không tìm thấy tài khoản khớp. Hãy thử Gmail, account_ref hoặc device đầy đủ hơn.";
    }
    return `Đã thấy ${scanQuery.data.candidates.length} tài khoản khả nghi. Chọn đúng người rồi mới mở vùng quản lý.`;
  }, [query, scanQuery.isFetching, scanQuery.data]);

  if (appCode !== "find-dumps") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trung tâm điều khiển</CardTitle>
          <CardDescription>Khu này hiện chỉ bật riêng cho Find Dumps.</CardDescription>
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
            <Badge variant="outline">Trung tâm điều khiển</Badge>
            <Badge variant="outline">Quét rồi mới quản lý</Badge>
          </div>
          <CardTitle className="text-2xl">Điều khiển tài khoản trực tiếp</CardTitle>
          <CardDescription>
            Một màn riêng để admin quét theo Gmail / IP / device, xác nhận đúng tài khoản rồi mới sửa ví, gói, ngày hết hạn, mở khóa feature, khóa đăng nhập, cấm hoặc xóa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[1.35fr,0.65fr]">
          <div className="rounded-3xl border bg-background p-4">
            <div className="grid gap-3 md:grid-cols-[180px,1fr,auto]">
              <div className="space-y-2">
                <Label>Kiểu quét</Label>
                <Select value={scanMode} onValueChange={(value: ScanMode) => setScanMode(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="ip">IP / IP hash</SelectItem>
                    <SelectItem value="device">Device</SelectItem>
                    <SelectItem value="user_id">Account ref</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dữ liệu quét</Label>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="demo.finddumps@gmail.com / fingerprint / ip hash" />
              </div>
              <div className="flex items-end">
                <Button className="w-full md:w-auto" onClick={() => setScanToken((v) => v + 1)} disabled={!query.trim() || scanQuery.isFetching}><Search className="mr-2 h-4 w-4" />Quét tài khoản</Button>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">{scanSummary}</div>
            <div className="mt-4 space-y-3">
              {(scanQuery.data?.candidates || []).map((candidate: Candidate) => (
                <button key={candidate.accountRef} type="button" onClick={() => setConfirmedAccountRef(candidate.accountRef)} className={`w-full rounded-3xl border p-4 text-left transition ${confirmedAccountRef === candidate.accountRef ? "border-primary bg-primary/[0.06]" : "bg-background hover:border-primary/40"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium break-all">{candidate.accountRef}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Nguồn: {candidate.source.join(" • ")} • Plan hiện tại: {candidate.activePlan.toUpperCase()} • Session: {candidate.sessionCount}</div>
                    </div>
                    <Badge variant={confirmedAccountRef === candidate.accountRef ? "secondary" : "outline"}>{confirmedAccountRef === candidate.accountRef ? "Đã xác nhận" : "Chọn quản lý"}</Badge>
                  </div>
                  {candidate.devices.length ? <div className="mt-2 text-xs text-muted-foreground">Thiết bị: {candidate.devices.join(" • ")}</div> : null}
                  <div className="mt-2 text-xs text-muted-foreground">Lần thấy gần nhất: {formatVietnameseDateTime(candidate.lastSeenAt)}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard icon={<Mail className="h-4 w-4" />} label="Tài khoản" value={confirmedAccountRef || "Chưa chọn"} />
            <StatCard icon={<Smartphone className="h-4 w-4" />} label="Device mới nhất" value={accountDraft.deviceId || "—"} />
            <StatCard icon={<CreditCard className="h-4 w-4" />} label="Ví hiện tại" value={`Thường ${accountDraft.softBalance} • VIP ${accountDraft.premiumBalance}`} />
          </div>
        </CardContent>
      </Card>

      {confirmedAccountRef ? (
        <Tabs defaultValue="wallet" className="space-y-3">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-3xl border bg-background p-2">
            <TabsTrigger value="wallet">Ví & gói</TabsTrigger>
            <TabsTrigger value="features">Feature</TabsTrigger>
            <TabsTrigger value="discipline">Khóa / cấm / xóa</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="wallet">
            <Card>
              <CardHeader>
                <CardTitle>Ví, gói và ngày hết hạn</CardTitle>
                <CardDescription>Cho phép credit thường / VIP âm, đổi gói hiện tại, xóa gia hạn, thêm gia hạn hoặc kéo dài hạn. Mọi thao tác nặng đều cần xác nhận và lưu audit.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <Field label="Credit thường (cho phép âm)"><Input value={accountDraft.softBalance} onChange={(e) => setAccountDraft((p: any) => ({ ...p, softBalance: e.target.value }))} /></Field>
                <Field label="Credit VIP (cho phép âm)"><Input value={accountDraft.premiumBalance} onChange={(e) => setAccountDraft((p: any) => ({ ...p, premiumBalance: e.target.value }))} /></Field>
                <Field label="Gói hiện tại">
                  <Select value={accountDraft.currentPlan} onValueChange={(value) => setAccountDraft((p: any) => ({ ...p, currentPlan: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic</SelectItem>
                      <SelectItem value="go">Go</SelectItem>
                      <SelectItem value="plus">Plus</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Ngày hết hạn">
                  <Input type="datetime-local" value={accountDraft.expiresAt} onChange={(e) => setAccountDraft((p: any) => ({ ...p, expiresAt: e.target.value }))} />
                  <div className="text-xs text-muted-foreground">Hiển thị chuẩn người đọc: {formatVietnameseDateTime(fromDateTimeLocalValue(accountDraft.expiresAt))}</div>
                </Field>
                <div className="rounded-2xl border p-4 lg:col-span-2">
                  <div className="text-sm font-medium">Thanh điều khiển gia hạn nhanh</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[1, 7, 30].map((days) => (
                      <Button key={days} type="button" variant="outline" onClick={() => setAccountDraft((p: any) => ({ ...p, expiresAt: toDateTimeLocalValue(addDaysIso(fromDateTimeLocalValue(p.expiresAt), days)) }))}>+{days} ngày</Button>
                    ))}
                    <Button type="button" variant="outline" onClick={() => setPendingAction({ kind: "wipe_expiry", title: "Xóa gia hạn hiện tại", description: "Thao tác này sẽ xóa ngày hết hạn hiện tại của entitlement đang chọn. Vẫn yêu cầu xác nhận và ghi audit log." })}>Xóa gia hạn</Button>
                  </div>
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label>Lý do thao tác</Label>
                  <Textarea rows={3} value={reasonDraft} onChange={(e) => setReasonDraft(e.target.value)} placeholder="Ví dụ: cộng bù 7 ngày do lỗi server, chỉnh credit VIP theo audit giao dịch..." />
                </div>
                <div className="flex flex-wrap gap-2 lg:col-span-2">
                  <Button onClick={() => setPendingAction({ kind: "save_account", title: "Lưu ví, gói và hạn", description: "Sẽ cập nhật ví thường, ví VIP, gói hiện tại và ngày hết hạn cho đúng tài khoản đã xác nhận." })}><UserRoundCheck className="mr-2 h-4 w-4" />Lưu thay đổi</Button>
                  <div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">Lần active gần nhất: {formatVietnameseDateTime(detailQuery.data?.entitlements?.[0]?.starts_at)} • Hết hạn: {formatVietnameseDateTime(detailQuery.data?.entitlements?.[0]?.expires_at)}</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features">
            <Card>
              <CardHeader>
                <CardTitle>Mở khóa / khóa lại feature</CardTitle>
                <CardDescription>Bật là tạo unlock admin cho đúng tài khoản. Tắt là revoke unlock đang active. Thời gian hiển thị theo kiểu ngày tháng năm cho dễ đọc.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {featureDrafts.map((feature, index) => (
                  <div key={feature.accessCode} className="rounded-3xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{feature.title}</div>
                        <div className="text-xs text-muted-foreground break-all">{feature.accessCode} • guard: {(feature.guardedFeatureCodes || []).join(", ") || "—"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Hết hạn mở khóa: {formatVietnameseDateTime(fromDateTimeLocalValue(feature.expiresAt))}</div>
                      </div>
                      <Switch checked={Boolean(feature.enabled)} onCheckedChange={(checked) => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: checked } : item))} />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr,auto,auto,auto]">
                      <Input type="datetime-local" value={feature.expiresAt} onChange={(e) => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, expiresAt: e.target.value } : item))} />
                      {[1, 7, 30].map((days) => (
                        <Button
                          key={days}
                          type="button"
                          variant="outline"
                          onClick={() => setFeatureDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, expiresAt: toDateTimeLocalValue(addDaysIso(fromDateTimeLocalValue(item.expiresAt), days)) } : item))}
                        >
                          +{days} ngày
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button onClick={() => setPendingAction({ kind: "save_features", title: "Lưu trạng thái feature", description: "Các feature được bật sẽ được grant admin, các feature tắt sẽ bị revoke. Audit log sẽ được ghi lại." })}>Lưu feature</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="discipline">
            <Card>
              <CardHeader>
                <CardTitle>Kỷ luật tài khoản</CardTitle>
                <CardDescription>Cấm, khóa đăng nhập và xóa tài khoản đều là thao tác nặng nên phải xác nhận trước, đồng thời lưu audit log.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SensitiveTile icon={<Ban className="h-4 w-4" />} title="Cấm tài khoản" desc="Chặn account_ref ở runtime controls." actionLabel="Cấm" onClick={() => setPendingAction({ kind: "ban", title: "Cấm tài khoản", description: "Sẽ thêm tài khoản này vào blocked_accounts và ghi audit log." })} />
                <SensitiveTile icon={<Lock className="h-4 w-4" />} title="Khóa đăng nhập" desc="Giữ tài khoản lại nhưng khóa login cho tới khi admin mở." actionLabel="Khóa login" onClick={() => setPendingAction({ kind: "lock", title: "Khóa đăng nhập", description: "Sẽ khóa tài khoản này ở runtime account bindings và ghi audit log." })} />
                <SensitiveTile icon={<LockOpen className="h-4 w-4" />} title="Mở khóa lại" desc="Gỡ cờ khóa login cho tài khoản đã bị khóa." actionLabel="Mở khóa" onClick={() => setPendingAction({ kind: "unlock", title: "Mở khóa lại", description: "Sẽ gỡ trạng thái khóa login cho tài khoản này và ghi audit log." })} />
                <SensitiveTile icon={<Trash2 className="h-4 w-4" />} title="Xóa tài khoản" desc="Xóa ví, entitlement, session và feature unlock của đúng account đã xác nhận." actionLabel="Xóa dữ liệu" onClick={() => setPendingAction({ kind: "delete", title: "Xóa toàn bộ dữ liệu tài khoản", description: "Thao tác rất nặng. Sẽ xóa ví, entitlement, session và unlock của tài khoản đã xác nhận." })} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Audit log gần nhất</CardTitle>
                <CardDescription>Mọi thao tác nặng đều nên có dấu vết. Màn này đọc từ server_app_admin_audit_logs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(detailQuery.data?.audits || []).length ? (detailQuery.data?.audits || []).map((item: any) => (
                  <div key={item.id} className="rounded-2xl border p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{item.action}</div>
                      <Badge variant="outline">{formatVietnameseDateTime(item.created_at)}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{item.reason || "Không ghi lý do"}</div>
                  </div>
                )) : <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Chưa có audit log cho tài khoản này trong bảng admin audit.</div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : null}

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Lý do / mô tả thao tác</Label>
            <Textarea rows={4} value={reasonDraft} onChange={(e) => setReasonDraft(e.target.value)} placeholder="Nhập lý do để audit log rõ ràng hơn..." />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!pendingAction) return;
                if (pendingAction.kind === "save_account") saveAccountMutation.mutate();
                else if (pendingAction.kind === "save_features") saveFeaturesMutation.mutate();
                else disciplineMutation.mutate(pendingAction.kind);
              }}
            >
              Xác nhận thao tác
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl border bg-background p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">{icon}{label}</div>
      <div className="mt-2 break-all text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function SensitiveTile({ icon, title, desc, actionLabel, onClick }: { icon: ReactNode; title: string; desc: string; actionLabel: string; onClick: () => void }) {
  return (
    <div className="rounded-3xl border border-destructive/20 bg-destructive/[0.03] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">{icon}{title}</div>
      <div className="mt-2 text-sm text-muted-foreground">{desc}</div>
      <Button variant="outline" className="mt-4" onClick={onClick}>{actionLabel}</Button>
    </div>
  );
}
