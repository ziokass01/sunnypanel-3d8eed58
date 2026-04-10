import { buildAppWorkspaceUrl, getAdminOrigin } from "@/lib/appWorkspace";

export type ServerAppCode = "free-fire" | "find-dumps";
export type WorkspaceSection = "config" | "runtime" | "keys" | "charge" | "audit" | "trash";
export type FindDumpsFreeChoiceKind = "package" | "credit";
export type FindDumpsWalletKind = "normal" | "vip";

export type PackagePolicy = {
  code: string;
  label: string;
  enabled: boolean;
  discountPercent: number;
  dailyCredit: number;
  dailyVipCredit: number;
  resetDaily: boolean;
  expiresFromClaim: boolean;
  oneTimeUse: boolean;
  defaultDays: number;
};

export type CreditPolicy = {
  code: string;
  label: string;
  defaultAmount: number;
  allowDecimal: boolean;
  expiresHours: number;
  oneTimeUse: boolean;
  walletKind: FindDumpsWalletKind;
};

export type FeaturePolicy = {
  code: string;
  title: string;
  baseCredit: number;
  vipCredit: number;
  freeForClassic: boolean;
  discountablePlans: string[];
  limitLabel: string;
};

export const FIND_DUMPS_PACKAGES: PackagePolicy[] = [
  { code: "classic", label: "Classic", enabled: true, discountPercent: 0, dailyCredit: 0, dailyVipCredit: 0, resetDaily: false, expiresFromClaim: true, oneTimeUse: true, defaultDays: 3 },
  { code: "go", label: "Go", enabled: true, discountPercent: 8, dailyCredit: 3, dailyVipCredit: 0, resetDaily: true, expiresFromClaim: true, oneTimeUse: true, defaultDays: 7 },
  { code: "plus", label: "Plus", enabled: true, discountPercent: 20, dailyCredit: 5, dailyVipCredit: 1, resetDaily: true, expiresFromClaim: true, oneTimeUse: true, defaultDays: 30 },
  { code: "pro", label: "Pro", enabled: true, discountPercent: 35, dailyCredit: 8, dailyVipCredit: 2, resetDaily: true, expiresFromClaim: true, oneTimeUse: true, defaultDays: 30 },
];

export const FIND_DUMPS_CREDITS: CreditPolicy[] = [
  { code: "credit-normal", label: "Credit thường", defaultAmount: 1.5, allowDecimal: true, expiresHours: 24, oneTimeUse: true, walletKind: "normal" },
  { code: "credit-vip", label: "Credit VIP", defaultAmount: 0.5, allowDecimal: true, expiresHours: 24, oneTimeUse: true, walletKind: "vip" },
];

export const FIND_DUMPS_FEATURES: FeaturePolicy[] = [
  { code: "search-basic", title: "Search cơ bản", baseCredit: 0, vipCredit: 0, freeForClassic: true, discountablePlans: ["classic", "go", "plus", "pro"], limitLabel: "Không giới hạn" },
  { code: "batch-search", title: "Batch search", baseCredit: 1.0, vipCredit: 0.5, freeForClassic: false, discountablePlans: ["go", "plus", "pro"], limitLabel: "Quota theo ngày" },
  { code: "export-json", title: "Export JSON", baseCredit: 0.2, vipCredit: 0.1, freeForClassic: false, discountablePlans: ["plus", "pro"], limitLabel: "Theo phiên" },
  { code: "pseudo-browser", title: "Browser + pseudo", baseCredit: 1.5, vipCredit: 0.8, freeForClassic: false, discountablePlans: ["plus", "pro"], limitLabel: "Theo feature gate" },
  { code: "binary-scan-full", title: "Full scan", baseCredit: 2.0, vipCredit: 1.0, freeForClassic: false, discountablePlans: ["go", "plus", "pro"], limitLabel: "Theo lượt quét" },
  { code: "hex-tools", title: "Hex / codec tools", baseCredit: 0, vipCredit: 0, freeForClassic: true, discountablePlans: ["classic", "go", "plus", "pro"], limitLabel: "Tool free" },
];



export type FeatureUnlockPolicy = {
  accessCode: string;
  title: string;
  description: string;
  unlockFeatureCode: string;
  guardedFeatureCodes: string[];
  defaultDurationHours: number;
  softUnlockCost: number;
  premiumUnlockCost: number;
  freePlans: string[];
  renewable: boolean;
  enabled: boolean;
};

export const FIND_DUMPS_UNLOCKS: FeatureUnlockPolicy[] = [
  {
    accessCode: "binary_workspace",
    title: "Binary Workspace",
    description: "Mở quyền vào Binary Workspace. Sau khi mở khóa, scan, browser sâu, diff, save/restore và export vẫn trừ credit theo feature riêng.",
    unlockFeatureCode: "unlock_binary_workspace",
    guardedFeatureCodes: [
      "binary_scan_quick",
      "binary_scan_full",
      "ida_export_import",
      "ida_workspace_save",
      "ida_workspace_export",
      "ida_workspace_restore",
      "workspace_batch",
      "workspace_note",
      "workspace_export_result",
      "workspace_browser",
      "workspace_diff",
    ],
    defaultDurationHours: 24,
    softUnlockCost: 2,
    premiumUnlockCost: 1,
    freePlans: ["pro"],
    renewable: true,
    enabled: true,
  },
  {
    accessCode: "batch_tools",
    title: "Batch Search & diện rộng",
    description: "Mở quyền cho batch search, profile search và hàng đợi nền. Mở khóa chỉ cho phép dùng, còn mỗi lượt chạy vẫn trừ credit như thường.",
    unlockFeatureCode: "unlock_batch_tools",
    guardedFeatureCodes: ["batch_search", "background_queue", "profile_search"],
    defaultDurationHours: 24,
    softUnlockCost: 1,
    premiumUnlockCost: 0.5,
    freePlans: ["plus", "pro"],
    renewable: true,
    enabled: true,
  },
  {
    accessCode: "export_tools",
    title: "Export ra ngoài",
    description: "Mở quyền export TXT/JSON/CSV và đầu ra lớn. Sau khi mở khóa, mỗi lượt export vẫn đi qua lớp tiêu hao credit riêng.",
    unlockFeatureCode: "unlock_export_tools",
    guardedFeatureCodes: ["export_json", "workspace_export_result", "ida_workspace_export"],
    defaultDurationHours: 24,
    softUnlockCost: 0.5,
    premiumUnlockCost: 0.2,
    freePlans: ["go", "plus", "pro"],
    renewable: true,
    enabled: true,
  },
];

export type DailyResetPreview = {
  packageCode: string;
  softAmount: number;
  vipAmount: number;
  resetDaily: boolean;
};

export function roundCredit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

export function getFindDumpsPackage(planCode?: string | null) {
  const normalized = String(planCode || "classic").trim().toLowerCase();
  return FIND_DUMPS_PACKAGES.find((item) => item.code === normalized) ?? FIND_DUMPS_PACKAGES[0];
}

export function getFindDumpsCredit(code?: string | null) {
  const normalized = String(code || "credit-normal").trim().toLowerCase();
  return FIND_DUMPS_CREDITS.find((item) => item.code === normalized) ?? FIND_DUMPS_CREDITS[0];
}

export function getFindDumpsFeature(code?: string | null) {
  const normalized = String(code || "").trim().toLowerCase();
  return FIND_DUMPS_FEATURES.find((item) => item.code === normalized) ?? null;
}

export function computeFindDumpsFeatureCost(featureCode: string, opts?: { planCode?: string | null; walletKind?: FindDumpsWalletKind | null }) {
  const feature = getFindDumpsFeature(featureCode);
  const plan = getFindDumpsPackage(opts?.planCode);
  const walletKind = opts?.walletKind === "vip" ? "vip" : "normal";
  if (!feature) {
    return { feature: null, plan, walletKind, baseCost: 0, effectiveCost: 0, discountPercent: 0, free: true };
  }

  const rawBase = walletKind === "vip" ? feature.vipCredit : feature.baseCredit;
  const baseCost = roundCredit(rawBase);
  const eligibleForDiscount = feature.discountablePlans.includes(plan.code);
  const free = baseCost <= 0 || (plan.code === "classic" && feature.freeForClassic);
  const discountPercent = free || !eligibleForDiscount ? 0 : Math.max(0, Number(plan.discountPercent || 0));
  const effectiveCost = free ? 0 : roundCredit(baseCost * (1 - discountPercent / 100));

  return { feature, plan, walletKind, baseCost, effectiveCost, discountPercent, free };
}

export function buildFindDumpsDailyResetPreview(): DailyResetPreview[] {
  return FIND_DUMPS_PACKAGES.map((item) => ({
    packageCode: item.code,
    softAmount: roundCredit(item.dailyCredit),
    vipAmount: roundCredit(item.dailyVipCredit),
    resetDaily: Boolean(item.resetDaily),
  }));
}

export function getFindDumpsFreeFlowDefaults(choiceKind: FindDumpsFreeChoiceKind, code?: string | null) {
  if (choiceKind === "credit") {
    const credit = getFindDumpsCredit(code);
    return {
      choiceKind,
      rewardCode: credit.code,
      walletKind: credit.walletKind,
      creditAmount: roundCredit(credit.defaultAmount),
      expiresHours: credit.expiresHours,
      oneTimeUse: credit.oneTimeUse,
      expiresFromClaim: true,
    };
  }

  const plan = getFindDumpsPackage(code);
  return {
    choiceKind: "package" as const,
    rewardCode: plan.code,
    walletKind: null,
    creditAmount: 0,
    expiresHours: 0,
    oneTimeUse: plan.oneTimeUse,
    expiresFromClaim: plan.expiresFromClaim,
    dailyCredit: roundCredit(plan.dailyCredit),
    dailyVipCredit: roundCredit(plan.dailyVipCredit),
    discountPercent: roundCredit(plan.discountPercent),
  };
}

export function formatCredit(value: number) {
  const rounded = roundCredit(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(rounded * 10 === Math.round(rounded * 10) ? 1 : 2).replace(/0+$/, "").replace(/\.$/, "");
}

export function getServerAppMeta(appCode: string) {
  if (appCode === "free-fire") {
    return {
      code: "free-fire",
      label: "Free Fire",
      mode: "legacy" as const,
      description: "Nhánh legacy đang chạy thật. Admin free key hiện tại chính là server key của Free Fire.",
      serverUrl: (import.meta.env.VITE_SERVER_APP_FREE_FIRE_URL as string | undefined)?.trim() || `${getAdminOrigin()}/admin/free-keys?app=free-fire`,
      tabs: ["server"] as const,
      note: "Giữ nguyên luồng cũ, chỉ rút gọn cửa vào.",
    };
  }

  return {
    code: "find-dumps",
    label: "Find Dumps",
    mode: "app-host" as const,
    description: "Nhánh app-host mới với 6 tab tách riêng cấu hình, runtime, server key, charge rules, audit log và trash.",
    serverUrl: buildAppWorkspaceUrl("find-dumps", "keys"),
    tabs: ["config", "runtime", "keys", "charge", "audit", "trash"] as const,
    note: "Server key, credit và audit tách riêng để dễ quản lý.",
  };
}
