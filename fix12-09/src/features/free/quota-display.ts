export type FreeQuotaHistoryLike = {
  successToday?: number | null;
  successTodayByApp?: Record<string, number> | null;
};

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function positiveLimit(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.floor(number);
}

export function normalizeFreeAppCode(value: unknown) {
  return String(value || "free-fire").trim().toLowerCase() || "free-fire";
}

export function getFreeSuccessTodayForApp(history: FreeQuotaHistoryLike, appCode: string) {
  const normalizedAppCode = normalizeFreeAppCode(appCode);
  const perApp = history.successTodayByApp;
  if (perApp && Object.prototype.hasOwnProperty.call(perApp, normalizedAppCode)) {
    return nonNegativeInteger(perApp[normalizedAppCode]);
  }

  // Lịch sử v1 chưa lưu app_code. Trước khi có nhiều app, các lượt này thuộc
  // luồng Free Fire, vì vậy chỉ dùng tổng cũ làm fallback cho Free Fire.
  return normalizedAppCode === "free-fire" ? nonNegativeInteger(history.successToday) : 0;
}

export function resolveFreeRemainingToday(args: {
  appCode: string;
  serverRemaining?: number | null;
  fingerprintLimit?: number | null;
  ipLimit?: number | null;
  localSuccessToday?: number | null;
}) {
  const serverRemaining = Number(args.serverRemaining);
  if (args.serverRemaining !== null && args.serverRemaining !== undefined && Number.isFinite(serverRemaining) && serverRemaining >= 0) {
    return {
      remaining: Math.floor(serverRemaining),
      estimated: false,
      unlimited: false,
    };
  }

  const appCode = normalizeFreeAppCode(args.appCode);
  const fingerprintLimit = positiveLimit(args.fingerprintLimit);
  const ipLimit = positiveLimit(args.ipLimit);
  const finiteLimits = [fingerprintLimit, ipLimit].filter((value): value is number => value !== null);

  if (!finiteLimits.length) {
    return { remaining: null, estimated: false, unlimited: true };
  }

  // Card có tiêu đề "Thiết bị hiện tại": Free Fire ưu tiên quota thiết bị.
  // Các app riêng dùng giới hạn chặt hơn giữa thiết bị và IP như backend.
  const displayLimit = appCode === "free-fire"
    ? (fingerprintLimit ?? ipLimit as number)
    : Math.min(...finiteLimits);

  return {
    remaining: Math.max(0, displayLimit - nonNegativeInteger(args.localSuccessToday)),
    estimated: true,
    unlimited: false,
  };
}
