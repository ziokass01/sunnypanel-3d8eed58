import type { ReactNode } from "react";
import {
  BarChart3,
  Route,
  Link2,
  KeyRound,
  LayoutTemplate,
  Activity,
} from "lucide-react";
export type FreeAdminTab =
  "overview" | "flow" | "providers" | "types" | "content" | "monitor";
const items = [
  {
    id: "overview",
    label: "Tổng quan",
    icon: BarChart3,
    description: "Theo dõi tình hình và mở nhanh khu vực cần quản lý.",
  },
  {
    id: "flow",
    label: "Luồng lấy key",
    icon: Route,
    description: "Thời gian chờ, giới hạn lượt và điều kiện xác thực.",
  },
  {
    id: "providers",
    label: "Provider",
    icon: Link2,
    description: "Quản lý nguồn vượt link, thứ tự và hạn mức.",
  },
  {
    id: "types",
    label: "Loại key & Bonus",
    icon: KeyRound,
    description: "Loại key, thứ tự hiển thị và khung giờ bonus.",
  },
  {
    id: "content",
    label: "Nội dung public",
    icon: LayoutTemplate,
    description: "Thông báo, ghi chú và các liên kết tải ứng dụng.",
  },
  {
    id: "monitor",
    label: "Theo dõi & Test",
    icon: Activity,
    description: "Phiên, nhật ký, key đã phát và kiểm thử quản trị.",
  },
] as const;
export function FreeAdminWorkspace({
  active,
  onChange,
  toolbar,
  children,
}: {
  active: FreeAdminTab;
  onChange: (tab: FreeAdminTab) => void;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  const item = items.find((x) => x.id === active)!;
  return (
    <div className="free-admin-workspace space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Free keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.description}
          </p>
        </div>
      </header>
      <nav aria-label="Khu vực quản lý Free keys" className="free-admin-tabs">
        {items.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={active === x.id}
            onClick={() => onChange(x.id)}
          >
            <x.icon className="h-4 w-4 shrink-0" />
            <span>{x.label}</span>
          </button>
        ))}
      </nav>
      {["flow", "providers", "types", "content"].includes(active) && (
        <div className="free-admin-savebar">{toolbar}</div>
      )}
      {children}
      {active === "overview" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(1).map((x) => (
            <button
              key={x.id}
              type="button"
              className="rounded-2xl border bg-white p-4 text-left transition hover:border-amber-400"
              onClick={() => onChange(x.id)}
            >
              <x.icon className="mb-3 h-5 w-5 text-sky-700" />
              <strong className="block text-sm">{x.label}</strong>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                {x.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// All sections remain mounted: switching sections never destroys drafts or
// restarts the existing state/request lifecycle.
export function FreeAdminSection({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return (
    <div hidden={!show} className="free-admin-section space-y-4">
      {children}
    </div>
  );
}
