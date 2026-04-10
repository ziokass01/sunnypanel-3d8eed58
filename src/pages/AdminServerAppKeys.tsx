import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { KeyRound, ShieldCheck, TicketPercent } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildWorkspacePath, detectWorkspaceScope } from "@/lib/appWorkspace";
import { FIND_DUMPS_CREDITS, FIND_DUMPS_FEATURES, FIND_DUMPS_PACKAGES, getServerAppMeta } from "@/lib/serverAppPolicies";

export function AdminServerAppKeysPage() {
  const { appCode = "find-dumps" } = useParams();
  const meta = useMemo(() => getServerAppMeta(appCode), [appCode]);
  const scope = detectWorkspaceScope(typeof window !== "undefined" ? window.location.pathname : "");

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

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">Server key foundation</Badge>
        <h1 className="text-2xl font-semibold">Server key cho Find Dumps</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">Tách riêng package key, credit key, rule one-time use, quota và auto-expire từ thời điểm nhận. Đây là nền để nối backend thật mà không phá khung app-host.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Package key</div><div className="mt-1 text-2xl font-semibold">4</div></div><TicketPercent className="h-5 w-5 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Credit key</div><div className="mt-1 text-2xl font-semibold">2</div></div><KeyRound className="h-5 w-5 text-primary" /></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-5"><div><div className="text-xs uppercase text-muted-foreground">Rule cốt lõi</div><div className="mt-1 text-2xl font-semibold">One-time + Expiry</div></div><ShieldCheck className="h-5 w-5 text-primary" /></CardContent></Card>
      </div>

      <Accordion type="multiple" className="space-y-3">
        <AccordionItem value="packages" className="rounded-2xl border px-5">
          <AccordionTrigger>Package key: classic / go / plus / pro</AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader><TableRow><TableHead>Gói</TableHead><TableHead>Discount</TableHead><TableHead>Daily credit</TableHead><TableHead>VIP / ngày</TableHead><TableHead>Rule</TableHead></TableRow></TableHeader>
              <TableBody>
                {FIND_DUMPS_PACKAGES.map((item) => (
                  <TableRow key={item.code}>
                    <TableCell className="font-medium">{item.label}</TableCell>
                    <TableCell>{item.discountPercent}%</TableCell>
                    <TableCell>{item.dailyCredit}</TableCell>
                    <TableCell>{item.dailyVipCredit}</TableCell>
                    <TableCell>{item.expiresFromClaim ? "Hết hạn từ lúc nhận" : "Hết hạn từ lúc redeem"} · {item.oneTimeUse ? "One-time" : "Reuse"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="credits" className="rounded-2xl border px-5">
          <AccordionTrigger>Credit key: credit thường / credit VIP</AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-3 md:grid-cols-2">
              {FIND_DUMPS_CREDITS.map((item) => (
                <Card key={item.code}>
                  <CardHeader><CardTitle>{item.label}</CardTitle><CardDescription>Decimal credit chạy thật, không làm tròn giả.</CardDescription></CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <div>Mặc định: <span className="font-medium text-foreground">{item.defaultAmount}</span></div>
                    <div>Cho phép số thập phân: <span className="font-medium text-foreground">{item.allowDecimal ? "Có" : "Không"}</span></div>
                    <div>Hết hạn sau nhận: <span className="font-medium text-foreground">{item.expiresHours} giờ</span></div>
                    <div>Rule: <span className="font-medium text-foreground">{item.oneTimeUse ? "One-time use" : "Reuse"}</span></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="features" className="rounded-2xl border px-5">
          <AccordionTrigger>Áp dụng key theo feature và package</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              {FIND_DUMPS_FEATURES.map((feature) => (
                <div key={feature.code} className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{feature.title}</div>
                    <Badge variant="outline">{feature.code}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">Base: {feature.baseCredit} · VIP: {feature.vipCredit} · Discount: {feature.discountablePlans.join(", ")} · {feature.limitLabel}</div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="font-medium">Đi tiếp sang Charge / Credit Rules</div>
            <div className="text-sm text-muted-foreground">Tab charge dùng để chỉnh giá thật theo feature, discount %, daily reset và policy ví.</div>
          </div>
          <Button asChild variant="outline"><Link to={buildWorkspacePath(appCode, "charge", scope)}>Mở tab Charge</Link></Button>
        </CardContent>
      </Card>
    </section>
  );
}
