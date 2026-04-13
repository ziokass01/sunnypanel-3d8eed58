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
import { Gift, ShieldCheck, Sparkles, TicketPercent } from "lucide-react";

export function AdminServerAppRedeemPage() {
  const { appCode = "find-dumps" } = useParams();
  const { toast } = useToast();
  const [draft, setDraft] = useState({
    code: "SUNNY-GO-7D-AX21",
    title: "Go 7 ngày + credit nhẹ",
    note: "Mã quà riêng của Find Dumps. Không đụng free admin cũ.",
    rewardPlan: "go",
    rewardDays: "7",
    allowRenewSamePlan: false,
    totalRedeemLimit: "200",
    perIpLimit: "2",
    perDeviceLimit: "1",
    perAccountLimit: "1",
    softCredit: "5",
    vipCredit: "0",
    expireAt: "2026-05-30 23:59",
    enabled: true,
  });

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

  const preview = useMemo(() => {
    const plan = draft.rewardPlan.toUpperCase();
    const days = draft.rewardDays;
    return [
      `Mã áp dụng plan ${plan} trong ${days} ngày nếu plan đó cao hơn trạng thái hiện tại của user.`,
      `Nếu user đang có plan cao hơn, hệ thống chỉ giữ plan hiện tại và cộng credit theo mã.`,
      draft.allowRenewSamePlan
        ? "Nếu user đang có đúng plan đó, admin đã bật cho phép gia hạn khi trùng gói nên hệ thống có thể cộng thêm ngày."
        : "Nếu user đang có đúng plan đó, mặc định chỉ cộng credit, không tự cộng ngày.",
      `Giới hạn: tổng ${draft.totalRedeemLimit} lượt • IP ${draft.perIpLimit} • thiết bị ${draft.perDeviceLimit} • tài khoản ${draft.perAccountLimit}.`,
    ];
  }, [draft]);

  return (
    <section className="space-y-4">
      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Find Dumps</Badge>
            <Badge variant="outline">Create Redeem</Badge>
            <Badge variant="outline">UI foundation</Badge>
          </div>
          <CardTitle className="text-2xl">Tạo mã quà tự do</CardTitle>
          <CardDescription>
            Mã quà này tách riêng khỏi free admin cũ. Admin tự quyết định giới hạn IP, thiết bị, tài khoản, credit âm/dương và logic plan đi kèm.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <Tabs defaultValue="basic" className="space-y-3">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-3xl border bg-background p-2">
            <TabsTrigger value="basic">Thông tin mã</TabsTrigger>
            <TabsTrigger value="limit">Giới hạn</TabsTrigger>
            <TabsTrigger value="reward">Phần thưởng</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Card>
              <CardHeader>
                <CardTitle>Thông tin mã</CardTitle>
                <CardDescription>Mã có thể tạo tự do, ghi chú riêng và bật/tắt độc lập.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label="Mã redeem"><Input value={draft.code} onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value.toUpperCase() }))} /></Field>
                <Field label="Tên gợi nhớ"><Input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} /></Field>
                <Field label="Hết hạn"><Input value={draft.expireAt} onChange={(e) => setDraft((p) => ({ ...p, expireAt: e.target.value }))} /></Field>
                <div className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">Bật mã redeem</div>
                      <div className="text-sm text-muted-foreground">Tắt mã là server ngừng nhận ngay khi backend nối xong.</div>
                    </div>
                    <Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft((p) => ({ ...p, enabled: checked }))} />
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>Ghi chú admin</Label>
                  <Textarea rows={4} value={draft.note} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="limit">
            <Card>
              <CardHeader>
                <CardTitle>Giới hạn sử dụng</CardTitle>
                <CardDescription>Tách rõ tổng lượt, mỗi IP, mỗi thiết bị và mỗi tài khoản.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Tổng lượt redeem"><Input value={draft.totalRedeemLimit} onChange={(e) => setDraft((p) => ({ ...p, totalRedeemLimit: e.target.value }))} /></Field>
                <Field label="Mỗi IP tối đa"><Input value={draft.perIpLimit} onChange={(e) => setDraft((p) => ({ ...p, perIpLimit: e.target.value }))} /></Field>
                <Field label="Mỗi thiết bị tối đa"><Input value={draft.perDeviceLimit} onChange={(e) => setDraft((p) => ({ ...p, perDeviceLimit: e.target.value }))} /></Field>
                <Field label="Mỗi tài khoản tối đa"><Input value={draft.perAccountLimit} onChange={(e) => setDraft((p) => ({ ...p, perAccountLimit: e.target.value }))} /></Field>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reward">
            <Card>
              <CardHeader>
                <CardTitle>Plan và credit đi kèm</CardTitle>
                <CardDescription>Credit cho phép âm. Trùng plan mặc định chỉ cộng credit, chỉ cộng ngày khi admin bật toggle.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <Field label="Plan thưởng">
                  <Select value={draft.rewardPlan} onValueChange={(value) => setDraft((p) => ({ ...p, rewardPlan: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="go">Go</SelectItem>
                      <SelectItem value="plus">Plus</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Số ngày plan"><Input value={draft.rewardDays} onChange={(e) => setDraft((p) => ({ ...p, rewardDays: e.target.value }))} /></Field>
                <Field label="Credit thường (cho phép âm)"><Input value={draft.softCredit} onChange={(e) => setDraft((p) => ({ ...p, softCredit: e.target.value }))} /></Field>
                <Field label="Credit VIP (cho phép âm)"><Input value={draft.vipCredit} onChange={(e) => setDraft((p) => ({ ...p, vipCredit: e.target.value }))} /></Field>
                <div className="rounded-2xl border p-4 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">Cho phép gia hạn nếu trùng gói</div>
                      <div className="text-sm text-muted-foreground">Nếu tắt, trùng gói chỉ cộng credit. Nếu bật, server có thể cộng thêm ngày khi logic backend xác nhận hợp lệ.</div>
                    </div>
                    <Switch checked={draft.allowRenewSamePlan} onCheckedChange={(checked) => setDraft((p) => ({ ...p, allowRenewSamePlan: checked }))} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Gift className="h-5 w-5 text-primary" />Preview logic</CardTitle>
              <CardDescription>Tóm tắt rule của mã theo đúng hướng bạn đã chốt.</CardDescription>
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
              <MiniLine icon={<ShieldCheck className="h-4 w-4" />} text="Spam sai quá 3 lần thì khóa 5 phút, còn timeout/lỗi mạng không tính spam." />
              <MiniLine icon={<Sparkles className="h-4 w-4" />} text="Popup redeem trong app sẽ có loading, tích xanh, X đỏ và câu báo lỗi kiểu người dùng hiểu được." />
              <MiniLine icon={<TicketPercent className="h-4 w-4" />} text="Popup gia hạn 1/7/30 ngày sẽ có badge tiết kiệm / hot / ưu đãi theo đúng giá server." />
              <Separator />
              <Button className="w-full" onClick={() => toast({ title: "Đã lưu hướng UI", description: "Bước backend tiếp theo sẽ nối save thật, quét thật và audit log." })}>Lưu draft giao diện</Button>
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
