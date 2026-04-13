import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
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
import { AlertTriangle, Ban, CreditCard, Mail, Search, ShieldCheck, Smartphone } from "lucide-react";

type ScanMode = "gmail" | "ip" | "device" | "user_id";

type FeatureToggle = {
  code: string;
  label: string;
  enabled: boolean;
};

const DEFAULT_FEATURES: FeatureToggle[] = [
  { code: "binary_workspace", label: "Binary Workspace", enabled: true },
  { code: "batch_tools", label: "Batch tools", enabled: true },
  { code: "export_tools", label: "Export tools", enabled: true },
  { code: "dumps_soc", label: "Dumps so.c", enabled: false },
  { code: "runtime_redeem", label: "Nhập mã / redeem", enabled: true },
];

export function AdminServerAppControlPage() {
  const { appCode = "find-dumps" } = useParams();
  const { toast } = useToast();
  const [scanMode, setScanMode] = useState<ScanMode>("gmail");
  const [query, setQuery] = useState("");
  const [scanned, setScanned] = useState(false);
  const [features, setFeatures] = useState<FeatureToggle[]>(DEFAULT_FEATURES);
  const [accountDraft, setAccountDraft] = useState({
    gmail: "demo.finddumps@gmail.com",
    ip: "171.244.15.30",
    device: "SM-A256E / fingerprint-9A7C",
    userId: "fd_usr_001",
    plan: "plus",
    softCredit: "126.5",
    vipCredit: "4.5",
    expiresAt: "2026-05-12 22:00",
    banned: false,
    loginLocked: false,
    allowRenewSamePlan: false,
    note: "UI nền cho Trung tâm điều khiển. Bước backend sẽ nối scan thật, audit log và xác nhận 2 bước.",
  });

  const scanSummary = useMemo(() => {
    if (!scanned) return "Chưa quét tài khoản nào. Nhập Gmail, IP, device hoặc user id rồi bấm Quét.";
    return `Đã xác nhận tài khoản ${accountDraft.gmail} • plan ${accountDraft.plan.toUpperCase()} • credit thường ${accountDraft.softCredit} • VIP ${accountDraft.vipCredit}`;
  }, [accountDraft, scanned]);

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

  const doScan = () => {
    if (!query.trim()) {
      toast({ title: "Thiếu dữ liệu quét", description: "Nhập Gmail, IP, device hoặc user id trước khi quét." });
      return;
    }
    setScanned(true);
    toast({ title: "Đã quét tài khoản", description: `UI đã khóa đúng tài khoản theo ${scanMode}. Bước backend sẽ nối scan thật.` });
  };

  const confirmSensitive = (title: string, description: string) => {
    toast({ title, description });
  };

  return (
    <section className="space-y-4">
      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Find Dumps</Badge>
            <Badge variant="outline">UI foundation</Badge>
            <Badge variant="outline">Trung tâm điều khiển</Badge>
          </div>
          <CardTitle className="text-2xl">Điều khiển tài khoản trực tiếp</CardTitle>
          <CardDescription>
            Khu này tách hẳn khỏi free admin cũ. Admin quét tài khoản, xác nhận đúng người rồi mới sửa ví, gói, feature, gia hạn, khóa hoặc cấm.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1.3fr,0.7fr]">
          <div className="rounded-3xl border bg-background p-4">
            <div className="grid gap-3 md:grid-cols-[180px,1fr,auto]">
              <div className="space-y-2">
                <Label>Kiểu quét</Label>
                <Select value={scanMode} onValueChange={(value: ScanMode) => setScanMode(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="ip">IP</SelectItem>
                    <SelectItem value="device">Device</SelectItem>
                    <SelectItem value="user_id">User ID</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dữ liệu quét</Label>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ví dụ: demo.finddumps@gmail.com / 171.244... / fingerprint" />
              </div>
              <div className="flex items-end">
                <Button className="w-full md:w-auto" onClick={doScan}><Search className="mr-2 h-4 w-4" />Quét tài khoản</Button>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">{scanSummary}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1">
            <StatCard icon={<Mail className="h-4 w-4" />} label="Gmail" value={accountDraft.gmail} />
            <StatCard icon={<Smartphone className="h-4 w-4" />} label="Device" value={accountDraft.device} />
            <StatCard icon={<CreditCard className="h-4 w-4" />} label="Ví" value={`${accountDraft.softCredit} • VIP ${accountDraft.vipCredit}`} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="wallet" className="space-y-3">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-3xl border bg-background p-2">
          <TabsTrigger value="wallet">Ví & gói</TabsTrigger>
          <TabsTrigger value="features">Chức năng</TabsTrigger>
          <TabsTrigger value="discipline">Kỷ luật</TabsTrigger>
          <TabsTrigger value="note">Ghi chú</TabsTrigger>
        </TabsList>

        <TabsContent value="wallet">
          <Card>
            <CardHeader>
              <CardTitle>Ví, gói và gia hạn</CardTitle>
              <CardDescription>Cho phép cộng/trừ credit âm, đổi gói, set lại hạn và kiểm soát việc gia hạn trùng gói.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <Field label="Credit thường"><Input value={accountDraft.softCredit} onChange={(e) => setAccountDraft((p) => ({ ...p, softCredit: e.target.value }))} /></Field>
              <Field label="Credit VIP"><Input value={accountDraft.vipCredit} onChange={(e) => setAccountDraft((p) => ({ ...p, vipCredit: e.target.value }))} /></Field>
              <Field label="Gói hiện tại">
                <Select value={accountDraft.plan} onValueChange={(value) => setAccountDraft((p) => ({ ...p, plan: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="classic">Classic</SelectItem>
                    <SelectItem value="go">Go</SelectItem>
                    <SelectItem value="plus">Plus</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Hạn hiện tại"><Input value={accountDraft.expiresAt} onChange={(e) => setAccountDraft((p) => ({ ...p, expiresAt: e.target.value }))} /></Field>
              <div className="rounded-2xl border p-4 lg:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">Cho phép gia hạn nếu trùng gói</div>
                    <div className="text-sm text-muted-foreground">Mặc định trùng gói chỉ cộng credit. Chỉ bật khi admin muốn mã hoặc thao tác này được phép cộng thêm ngày.</div>
                  </div>
                  <Switch checked={accountDraft.allowRenewSamePlan} onCheckedChange={(checked) => setAccountDraft((p) => ({ ...p, allowRenewSamePlan: checked }))} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:col-span-2">
                <Button onClick={() => toast({ title: "Đã lưu draft UI", description: "Bước backend sẽ nối mutation sửa ví, gói và hạn." })}>Lưu thay đổi</Button>
                <Button variant="outline" onClick={() => confirmSensitive("Xác nhận xóa gia hạn", "Nút này sẽ có xác nhận 2 bước trước khi xóa hạn thật ở bước backend.")}>Xóa gia hạn</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Feature đang có / đang khóa</CardTitle>
              <CardDescription>Admin có thể mở thêm hoặc khóa lại feature cho đúng tài khoản đã quét.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {features.map((feature, index) => (
                <div key={feature.code} className="rounded-3xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{feature.label}</div>
                      <div className="text-xs text-muted-foreground">{feature.code}</div>
                    </div>
                    <Switch checked={feature.enabled} onCheckedChange={(checked) => setFeatures((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: checked } : item))} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discipline">
          <Card>
            <CardHeader>
              <CardTitle>Kỷ luật tài khoản</CardTitle>
              <CardDescription>Các nút ảnh hưởng mạnh đều phải có xác nhận trước khi chạm dữ liệu thật.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <SensitiveTile icon={<ShieldCheck className="h-4 w-4" />} title="Khóa đăng nhập" desc="Chặn đăng nhập mới nhưng chưa cấm hẳn tài khoản." actionLabel="Khóa đăng nhập" onClick={() => confirmSensitive("Xác nhận khóa đăng nhập", "Bước backend sẽ yêu cầu xác nhận 2 bước và lưu audit log.")} />
              <SensitiveTile icon={<Ban className="h-4 w-4" />} title="Cấm tài khoản" desc="Cấm toàn bộ quyền sử dụng cho tới khi admin gỡ cấm." actionLabel="Cấm tài khoản" onClick={() => confirmSensitive("Xác nhận cấm tài khoản", "Bước backend sẽ hiển thị popup xác nhận đỏ và bắt nhập lý do.")} />
              <SensitiveTile icon={<AlertTriangle className="h-4 w-4" />} title="Xóa tài khoản" desc="Thao tác nặng, giữ lại trong UI nhưng luôn yêu cầu xác nhận 2 bước." actionLabel="Xóa tài khoản" onClick={() => confirmSensitive("Xác nhận xóa tài khoản", "Bước backend sẽ chặn thao tác nhầm bằng xác nhận 2 lần.")} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="note">
          <Card>
            <CardHeader>
              <CardTitle>Ghi chú và audit</CardTitle>
              <CardDescription>UI này giữ chỗ cho lý do thao tác và nhật ký sau khi backend nối xong.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea rows={7} value={accountDraft.note} onChange={(e) => setAccountDraft((p) => ({ ...p, note: e.target.value }))} />
              <Separator />
              <div className="text-sm text-muted-foreground">Bản UI này chốt đúng hướng: quét tài khoản trước, xác nhận đúng người rồi mới mở vùng sửa ví, gói, feature và kỷ luật. Không nhét chung vào tab free admin cũ.</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
      <div className="mt-2 break-words text-sm font-semibold text-foreground">{value}</div>
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
