import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { normalizeRentClientCode } from "@/lib/rent-client-integration";

export type RentCreateClientSetupState = {
  enabled: boolean;
  clientCode: string;
  label: string;
  origins: string;
  rateLimit: string;
  note: string;
};

export function RentCreateClientSetupFields(props: {
  username: string;
  value: RentCreateClientSetupState;
  onChange: (next: RentCreateClientSetupState) => void;
}) {
  const { username, value, onChange } = props;

  useEffect(() => {
    if (!username.trim()) return;
    const suggestedCode = normalizeRentClientCode(username);
    const suggestedLabel = `Web khách ${username.trim().toLowerCase()}`;
    if (!value.clientCode || !value.label) {
      onChange({
        ...value,
        clientCode: value.clientCode || suggestedCode,
        label: value.label || suggestedLabel,
      });
    }
  }, [username]);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">(+) Setup khách ngay khi tạo user</div>
          <div className="text-sm text-muted-foreground">Bật phần này nếu muốn tạo luôn bản ghi tích hợp khách để sau đó chỉ việc copy cấu hình chạy.</div>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
        />
      </div>

      {value.enabled ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Client code</Label>
            <Input
              value={value.clientCode}
              onChange={(e) => onChange({ ...value, clientCode: normalizeRentClientCode(e.target.value) })}
              placeholder="khach_a"
            />
          </div>
          <div className="space-y-2">
            <Label>Tên hiển thị</Label>
            <Input
              value={value.label}
              onChange={(e) => onChange({ ...value, label: e.target.value })}
              placeholder="Web khách A"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Allowed origins</Label>
            <Textarea
              value={value.origins}
              onChange={(e) => onChange({ ...value, origins: e.target.value })}
              placeholder={"https://mityangho.id.vn\nhttps://a.mityangho.id.vn"}
            />
            <p className="text-xs text-muted-foreground">Mỗi dòng một domain/origin. Dùng đúng domain thật của web khách hoặc subdomain của bạn.</p>
          </div>
          <div className="space-y-2">
            <Label>Rate limit / phút</Label>
            <Input
              value={value.rateLimit}
              onChange={(e) => onChange({ ...value, rateLimit: e.target.value })}
              placeholder="60"
            />
          </div>
          <div className="space-y-2">
            <Label>Ghi chú setup</Label>
            <Input
              value={value.note}
              onChange={(e) => onChange({ ...value, note: e.target.value })}
              placeholder="Khách tạo từ form tạo user"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
