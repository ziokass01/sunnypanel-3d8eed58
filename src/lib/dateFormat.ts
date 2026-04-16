export function formatVietnameseDate(value?: string | Date | null, fallback = "—") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatVietnameseDateTime(value?: string | Date | null, fallback = "—") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const parts = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${get("day")} tháng ${get("month")} năm ${get("year")} • ${get("hour")}:${get("minute")}`;
}

export function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocalValue(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function addDaysIso(value: string | null | undefined, days: number) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base.getTime() + Math.max(0, days) * 86400000);
  return next.toISOString();
}
