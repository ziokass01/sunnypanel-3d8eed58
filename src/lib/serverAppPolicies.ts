import { buildAppWorkspaceUrl, getAdminOrigin } from "@/lib/appWorkspace";

export type ServerAppCode = "free-fire" | "find-dumps";
export type WorkspaceSection = "config" | "runtime" | "keys" | "charge" | "control" | "redeem" | "audit" | "trash";
export type FindDumpsFreeChoiceKind = "package" | "credit";
export type FindDumpsWalletKind = "normal" | "vip";

export type PackagePolicy = {
  code: string;
  label: string;
  enabled: boolean;
  discountPercent: number;
  discountPercentVip?: number;
  dailyCredit: number;
  dailyVipCredit: number;
  softBalanceCap: number;
  premiumBalanceCap: number;
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
  { code: "classic", label: "Classic", enabled: true, discountPercent: 0, discountPercentVip: 0, dailyCredit: 5, dailyVipCredit: 0, softBalanceCap: 5, premiumBalanceCap: 0, resetDaily: true, expiresFromClaim: true, oneTimeUse: true, defaultDays: 3 },
  { code: "go", label: "Go", enabled: true, discountPercent: 10, discountPercentVip: 0, dailyCredit: 7, dailyVipCredit: 0, softBalanceCap: 70, premiumBalanceCap: 0, resetDaily: true, expiresFromClaim: true, oneTimeUse: true, defaultDays: 7 },
  { code: "plus", label: "Plus", enabled: true, discountPercent: 35, discountPercentVip: 20, dailyCredit: 20, dailyVipCredit: 0.25, softBalanceCap: 200, premiumBalanceCap: 5, resetDaily: true, expiresFromClaim: true, oneTimeUse: true, defaultDays: 30 },
  { code: "pro", label: "Pro", enabled: true, discountPercent: 55, discountPercentVip: 30, dailyCredit: 50, dailyVipCredit: 0.5, softBalanceCap: 500, premiumBalanceCap: 10, resetDaily: true, expiresFromClaim: true, oneTimeUse: true, defaultDays: 30 },
];

export const FIND_DUMPS_CREDITS: CreditPolicy[] = [
  { code: "credit-normal", label: "Credit thường", defaultAmount: 5, allowDecimal: true, expiresHours: 72, oneTimeUse: true, walletKind: "normal" },
  { code: "credit-vip", label: "Credit VIP", defaultAmount: 0.2, allowDecimal: true, expiresHours: 72, oneTimeUse: true, walletKind: "vip" },
];

export const FIND_DUMPS_FEATURES: FeaturePolicy[] = [
  { code: "search_basic", title: "Search cơ bản", baseCredit: 0, vipCredit: 0, freeForClassic: true, discountablePlans: ["classic", "go", "plus", "pro"], limitLabel: "Không giới hạn" },
  { code: "batch_search", title: "Batch search", baseCredit: 0.20, vipCredit: 0, freeForClassic: false, discountablePlans: ["go", "plus", "pro"], limitLabel: "Quota theo ngày" },
  { code: "export_plain", title: "Export text", baseCredit: 0.05, vipCredit: 0, freeForClassic: false, discountablePlans: ["go", "plus", "pro"], limitLabel: "Theo lượt xuất" },
  { code: "export_json", title: "Export JSON", baseCredit: 0.10, vipCredit: 0, freeForClassic: false, discountablePlans: ["go", "plus", "pro"], limitLabel: "Theo lượt xuất" },
  { code: "workspace_browser", title: "Browser + pseudo", baseCredit: 0.50, vipCredit: 0.03, freeForClassic: false, discountablePlans: ["plus", "pro"], limitLabel: "Theo feature gate" },
  { code: "binary_scan_full", title: "Full scan", baseCredit: 1.00, vipCredit: 0.05, freeForClassic: false, discountablePlans: ["plus", "pro"], limitLabel: "Theo lượt quét" },
  { code: "game_profiles", title: "Game Profiles", baseCredit: 0, vipCredit: 0, freeForClassic: true, discountablePlans: ["classic", "go", "plus", "pro"], limitLabel: "Tool free" },
  { code: "runtime_redeem", title: "Nhập mã / kích hoạt", baseCredit: 0, vipCredit: 0, freeForClassic: true, discountablePlans: ["classic", "go", "plus", "pro"], limitLabel: "Tiện ích free" },
  { code: "convert_image", title: "Convert image", baseCredit: 0, vipCredit: 0, freeForClassic: true, discountablePlans: ["classic", "go", "plus", "pro"], limitLabel: "Tool free" },
  { code: "encode_decode", title: "Encode / Decode", baseCredit: 0, vipCredit: 0, freeForClassic: true, discountablePlans: ["classic", "go", "plus", "pro"], limitLabel: "Tool free" },
  { code: "hex_edit", title: "Hex edit", baseCredit: 0, vipCredit: 0, freeForClassic: true, discountablePlans: ["classic", "go", "plus", "pro"], limitLabel: "Tool free" },
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
  softUnlockCost7d?: number;
  premiumUnlockCost7d?: number;
  softUnlockCost30d?: number;
  premiumUnlockCost30d?: number;
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
    softUnlockCost: 2.0,
    premiumUnlockCost: 0.1,
    softUnlockCost7d: 10.0,
    premiumUnlockCost7d: 0.5,
    softUnlockCost30d: 30.0,
    premiumUnlockCost30d: 1.5,
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
    softUnlockCost: 1.0,
    premiumUnlockCost: 0,
    softUnlockCost7d: 5.0,
    premiumUnlockCost7d: 0,
    softUnlockCost30d: 15.0,
    premiumUnlockCost30d: 0,
    freePlans: ["plus", "pro"],
    renewable: true,
    enabled: true,
  },
  {
    accessCode: "export_tools",
    title: "Export ra ngoài",
    description: "Mở quyền export TXT/JSON/CSV và đầu ra lớn. Sau khi mở khóa, mỗi lượt export vẫn đi qua lớp tiêu hao credit riêng.",
    unlockFeatureCode: "unlock_export_tools",
    guardedFeatureCodes: ["export_plain", "export_text", "export_json", "workspace_export_result", "ida_workspace_export"],
    defaultDurationHours: 24,
    softUnlockCost: 1.0,
    premiumUnlockCost: 0,
    softUnlockCost7d: 4.0,
    premiumUnlockCost7d: 0,
    softUnlockCost30d: 12.0,
    premiumUnlockCost30d: 0,
    freePlans: ["go", "plus", "pro"],
    renewable: true,
    enabled: true,
  },
  {
    accessCode: "migration_tools",
    title: "Migration tools",
    description: "Placeholder cho Diff 2 dump, remap query, batch migrate, compare và validation. Mở khóa chỉ mở quyền vào cửa, chạy thật vẫn trừ credit theo feature tương ứng.",
    unlockFeatureCode: "unlock_migration_tools",
    guardedFeatureCodes: ["diff_two_dumps", "query_remap", "batch_migrate", "batch_compare", "batch_validate", "export_report"],
    defaultDurationHours: 24,
    softUnlockCost: 1.5,
    premiumUnlockCost: 0.08,
    softUnlockCost7d: 7.0,
    premiumUnlockCost7d: 0.35,
    softUnlockCost30d: 21.0,
    premiumUnlockCost30d: 1.05,
    freePlans: ["plus", "pro"],
    renewable: true,
    enabled: true,
  },
  {
    accessCode: "dumps_soc",
    title: "Dumps so.c",
    description: "Mở quyền vào màn phân tích .so.c riêng. Chức năng này tách hẳn khỏi Binary Workspace và dùng rule engine chuyên cho file decompile.",
    unlockFeatureCode: "unlock_dumps_soc",
    guardedFeatureCodes: ["dumps_soc_analyzer"],
    defaultDurationHours: 24,
    softUnlockCost: 2.0,
    premiumUnlockCost: 0.1,
    softUnlockCost7d: 9.0,
    premiumUnlockCost7d: 0.45,
    softUnlockCost30d: 27.0,
    premiumUnlockCost30d: 1.35,
    freePlans: ["pro"],
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
  const rawDiscount = walletKind === "vip"
    ? Number(plan.discountPercentVip ?? plan.discountPercent ?? 0)
    : Number(plan.discountPercent ?? 0);
  const discountPercent = free || !eligibleForDiscount ? 0 : Math.max(0, rawDiscount);
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
    description: "Nhánh app-host mới tách riêng cấu hình, runtime, server key, charge rules, trung tâm điều khiển, create redeem, audit log và trash.",
    serverUrl: buildAppWorkspaceUrl("find-dumps", "keys"),
    tabs: ["config", "runtime", "keys", "charge", "control", "redeem", "audit", "trash"] as const,
    note: "Create Redeem và Trung tâm điều khiển được tách riêng khỏi free admin cũ.",
  };
}
