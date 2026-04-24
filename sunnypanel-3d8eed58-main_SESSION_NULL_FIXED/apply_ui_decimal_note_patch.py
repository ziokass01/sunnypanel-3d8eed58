from pathlib import Path
import re

ROOT = Path('.')
free = ROOT / 'src/pages/FreeLanding.tsx'
detail = ROOT / 'src/pages/AdminServerAppDetail.tsx'
note = ROOT / 'NOTE_20260411_FREE_FINDDUMPS_HANDOVER.md'

free_text = free.read_text(encoding='utf-8')
detail_text = detail.read_text(encoding='utf-8')

# ----- FreeLanding.tsx -----
free_text = free_text.replace(
    'import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";',
    'import { fetchFreeConfig, type FreeConfig, type FreeKeyType } from "@/features/free/free-config";'
)
free_text = free_text.replace(
    'import { FIND_DUMPS_CREDITS, FIND_DUMPS_PACKAGES, formatCredit, getFindDumpsCredit, getFindDumpsFreeFlowDefaults, getFindDumpsPackage } from "@/lib/serverAppPolicies";',
    'import { getFindDumpsFreeFlowDefaults } from "@/lib/serverAppPolicies";'
)
free_text = free_text.replace(
    '  getSelectedAppCode,\n  getFindDumpsFreeSelection,\n  setFindDumpsFreeSelection,\n',
    '  getSelectedAppCode,\n  setFindDumpsFreeSelection,\n'
)

insert_after = 'const LAST_FREE_KEY_STORAGE = "lastFreeKey";\n\n'
if 'type FreeKeySummaryMeta' not in free_text:
    free_text = free_text.replace(insert_after, insert_after + '''type FreeKeySummaryMeta = {\n  label: string;\n  badge: string;\n};\n\nconst FREE_KEY_SUMMARY_META: Record<string, FreeKeySummaryMeta> = {\n  "free-fire": { label: "Key Free Fire", badge: "Free Fire" },\n  "find-dumps": { label: "Key Find Dumps", badge: "Find Dumps" },\n};\n\nfunction getFreeKeySummaryMeta(appCode?: string | null, keyType?: FreeKeyType | null) {\n  const code = String(appCode || "").trim().toLowerCase();\n  const direct = FREE_KEY_SUMMARY_META[code];\n  if (direct) return direct;\n\n  const appLabel = String(keyType?.app_label || code || "Key").trim();\n  return {\n    label: appLabel ? `Key ${appLabel}` : "Key đang chọn",\n    badge: appLabel || "Khác",\n  };\n}\n\n''')

free_text = free_text.replace(
    '  const storedFindDumpsSelection = getFindDumpsFreeSelection();\n  const [findDumpsChoiceKind, setFindDumpsChoiceKind] = useState<"package" | "credit">(storedFindDumpsSelection.mode === "credit" ? "credit" : "package");\n  const [findDumpsRewardCode, setFindDumpsRewardCode] = useState<string>(storedFindDumpsSelection.rewardCode || "classic");\n',
    ''
)

pattern = re.compile(
    r'  const findDumpsSelectionMode = useMemo\(\(\) => \{.*?  const selectedQuotaMeta = useMemo\(\(\) => cfg\?\.free_quota_by_app\?\.\[selectedAppCode\] \?\? null, \[cfg\?\.free_quota_by_app, selectedAppCode\]\);\n',
    re.DOTALL,
)
replacement = '''  const effectiveFindDumpsKind = useMemo(() => {\n    if (String(selectedKeyMeta?.default_credit_code || "").trim()) return "credit" as const;\n    return "package" as const;\n  }, [selectedKeyMeta?.default_credit_code]);\n  const effectiveFindDumpsCode = useMemo(() => String((effectiveFindDumpsKind === "credit" ? selectedKeyMeta?.default_credit_code : selectedKeyMeta?.default_package_code) || (effectiveFindDumpsKind === "credit" ? "credit-normal" : "classic")).trim(), [effectiveFindDumpsKind, selectedKeyMeta?.default_credit_code, selectedKeyMeta?.default_package_code]);\n  const effectiveFindDumpsReward = useMemo(() => {\n    if (!isFindDumpsSelected) return null;\n    return effectiveFindDumpsKind === "credit"\n      ? getFindDumpsFreeFlowDefaults("credit", effectiveFindDumpsCode)\n      : getFindDumpsFreeFlowDefaults("package", effectiveFindDumpsCode);\n  }, [effectiveFindDumpsCode, effectiveFindDumpsKind, isFindDumpsSelected]);\n  const selectedQuotaMeta = useMemo(() => cfg?.free_quota_by_app?.[selectedAppCode] ?? null, [cfg?.free_quota_by_app, selectedAppCode]);\n  const selectedKeySummaryMeta = useMemo(() => getFreeKeySummaryMeta(selectedAppCode, selectedKeyMeta), [selectedAppCode, selectedKeyMeta]);\n'''
free_text = pattern.sub(replacement, free_text, count=1)

free_text = re.sub(
    r'\n  useEffect\(\(\) => \{\n    if \(!isFindDumpsSelected\) return;.*?\n  \}, \[findDumpsSelectionMode, isFindDumpsSelected, selectedKeyMeta\?\.default_credit_code, selectedKeyMeta\?\.default_package_code\]\);\n',
    '\n',
    free_text,
    flags=re.DOTALL,
)

needle = '              <FreeDeviceHistoryCard history={deviceHistory} remainingTodayServer={selectedQuotaMeta?.remaining_today ?? cfg?.free_quota_remaining_today ?? null} lastKeyExpiresAt={lastFreeKey?.expires_at ?? null} />\n\n              <div className="space-y-2 rounded-2xl border bg-background/70 p-4">'
replacement = '''              <FreeDeviceHistoryCard history={deviceHistory} remainingTodayServer={selectedQuotaMeta?.remaining_today ?? cfg?.free_quota_remaining_today ?? null} lastKeyExpiresAt={lastFreeKey?.expires_at ?? null} />\n\n              <div className="rounded-2xl border bg-background/70 p-4 shadow-sm">\n                <div className="flex items-center justify-between gap-3">\n                  <div>\n                    <div className="text-sm font-semibold">Thông tin key đang chọn</div>\n                    <div className="text-xs text-muted-foreground">Hiển thị theo app của key hiện tại để sau này thêm app mới vẫn mở rộng được, không gãy flow.</div>\n                  </div>\n                  <Badge variant="secondary" className="rounded-full">{selectedKeySummaryMeta.badge}</Badge>\n                </div>\n                <div className="mt-3 grid gap-2 sm:grid-cols-3">\n                  <div className="rounded-2xl border bg-background/80 p-3">\n                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tên key</div>\n                    <div className="mt-1 text-sm font-semibold text-foreground">{selectedKeySummaryMeta.label}</div>\n                    <div className="text-xs text-muted-foreground">Đổi theo loại key đang chọn</div>\n                  </div>\n                  <div className="rounded-2xl border bg-background/80 p-3">\n                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Giới hạn thiết bị</div>\n                    <div className="mt-1 text-sm font-semibold text-foreground">{selectedQuotaMeta?.free_daily_limit_per_fingerprint ?? cfg?.free_daily_limit_per_fingerprint ?? 0} / ngày</div>\n                    <div className="text-xs text-muted-foreground">Tính theo fingerprint thiết bị</div>\n                  </div>\n                  <div className="rounded-2xl border bg-background/80 p-3">\n                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Giới hạn IP key</div>\n                    <div className="mt-1 text-sm font-semibold text-foreground">{selectedQuotaMeta?.free_daily_limit_per_ip ?? cfg?.free_daily_limit_per_ip ?? 0} / ngày</div>\n                    <div className="text-xs text-muted-foreground">Tính theo IP hiện tại</div>\n                  </div>\n                </div>\n              </div>\n\n              <div className="space-y-2 rounded-2xl border bg-background/70 p-4">'''
free_text = free_text.replace(needle, replacement)

free_text = re.sub(
    r'\n              \{isFindDumpsSelected \? \(\n                <div className="space-y-4 rounded-2xl border bg-background/70 p-4">.*?\n              \) : null\}\n',
    '\n',
    free_text,
    flags=re.DOTALL,
)

free.write_text(free_text, encoding='utf-8')

# ----- AdminServerAppDetail.tsx -----
insert_after = 'function normalizeDecimal(value: string | number | null | undefined) {\n  const num = Number(value ?? 0);\n  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;\n}\n\n'
if 'const DECIMAL_INPUT_PROPS' not in detail_text:
    detail_text = detail_text.replace(insert_after, insert_after + '''const DECIMAL_INPUT_PROPS = {\n  inputMode: "decimal" as const,\n  enterKeyHint: "done" as const,\n  autoComplete: "off" as const,\n};\n\nfunction normalizeDecimalDraftInput(value: string) {\n  const raw = String(value ?? "").replace(/,/g, ".").replace(/[^0-9.]/g, "");\n  const firstDot = raw.indexOf(".");\n  if (firstDot === -1) return raw;\n  return `${raw.slice(0, firstDot + 1)}${raw.slice(firstDot + 1).replace(/\./g, "")}`;\n}\n\n''')

replacements = {
    'Input value={numericInput(plan.daily_soft_credit)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, daily_soft_credit: e.target.value } : item))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(plan.daily_soft_credit)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, daily_soft_credit: normalizeDecimalDraftInput(e.target.value) } : item))} />',
    'Input value={numericInput(plan.daily_premium_credit)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, daily_premium_credit: e.target.value } : item))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(plan.daily_premium_credit)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, daily_premium_credit: normalizeDecimalDraftInput(e.target.value) } : item))} />',
    'Input value={numericInput(plan.soft_cost_multiplier)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_cost_multiplier: e.target.value } : item))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(plan.soft_cost_multiplier)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_cost_multiplier: normalizeDecimalDraftInput(e.target.value) } : item))} />',
    'Input value={numericInput(plan.premium_cost_multiplier)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_cost_multiplier: e.target.value } : item))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(plan.premium_cost_multiplier)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_cost_multiplier: normalizeDecimalDraftInput(e.target.value) } : item))} />',
    'Input value={numericInput(feature.soft_cost)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_cost: e.target.value } : item))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(feature.soft_cost)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_cost: normalizeDecimalDraftInput(e.target.value) } : item))} />',
    'Input value={numericInput(feature.premium_cost)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_cost: e.target.value } : item))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(feature.premium_cost)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_cost: normalizeDecimalDraftInput(e.target.value) } : item))} />',
    'Input value={numericInput(walletDraft.soft_daily_reset_amount)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_daily_reset_amount: e.target.value }))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(walletDraft.soft_daily_reset_amount)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_daily_reset_amount: normalizeDecimalDraftInput(e.target.value) }))} />',
    'Input value={numericInput(walletDraft.soft_floor_credit)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_floor_credit: e.target.value }))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(walletDraft.soft_floor_credit)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_floor_credit: normalizeDecimalDraftInput(e.target.value) }))} />',
    'Input value={numericInput(walletDraft.premium_daily_reset_amount)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_daily_reset_amount: e.target.value }))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(walletDraft.premium_daily_reset_amount)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_daily_reset_amount: normalizeDecimalDraftInput(e.target.value) }))} />',
    'Input value={numericInput(walletDraft.premium_floor_credit)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_floor_credit: e.target.value }))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(walletDraft.premium_floor_credit)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_floor_credit: normalizeDecimalDraftInput(e.target.value) }))} />',
    'Input value={numericInput(pkg.soft_credit_amount)} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_credit_amount: e.target.value } : item))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(pkg.soft_credit_amount)} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_credit_amount: normalizeDecimalDraftInput(e.target.value) } : item))} />',
    'Input value={numericInput(pkg.premium_credit_amount)} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_credit_amount: e.target.value } : item))} />': 'Input type="text" {...DECIMAL_INPUT_PROPS} value={numericInput(pkg.premium_credit_amount)} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_credit_amount: normalizeDecimalDraftInput(e.target.value) } : item))} />',
}
for old, new in replacements.items():
    detail_text = detail_text.replace(old, new)

detail.write_text(detail_text, encoding='utf-8')

note.write_text('''# NOTE 2026-04-11 · FREE + FIND DUMPS HANDOVER\n\n## Hôm nay đã gặp gì\n\n1. Trang `/free/gate` bị trắng vì `FreeGate.tsx` từng bị vá chồng 2 bản hàm vào cùng một file.\n2. Trang `/free/gate/claim` từng 404 vì route/flow claim không đồng bộ với gate.\n3. `AdminServerAppKeys.tsx` từng thiếu `soft_credit_amount` và `premium_credit_amount` ở package payload nên lưu `Server key` nổ `not-null constraint`.\n4. Project thật cần dùng là `uvqgpgkaxpiczasfwzgm`, không phải project ref cũ.\n\n## Đã fix trong ngày\n\n- Khôi phục gate/claim bằng bản sạch và đồng bộ lại flow FREE.\n- Giữ payload an toàn cho `server_app_reward_packages` để package rows luôn có `soft_credit_amount = 0` và `premium_credit_amount = 0`.\n- Ẩn khối lớn `Nhánh riêng cho Find Dumps` ở `/free`, thay bằng box nhỏ hiển thị tên key và quota theo key/app đang chọn.\n- Mở nhập số thập phân ổn định trên mobile ở trang cấu hình app Find Dumps bằng `inputMode="decimal"` + chuẩn hóa `,` thành `.`.\n\n## Lưu ý cực quan trọng\n\n1. Không chép lại file `FreeGate.tsx` hoặc `FreeClaim.tsx` từ đoạn chat/commit cũ nếu chưa kiểm tra toàn bộ file. Hai file này rất dễ gãy khi dính vá chồng.\n2. Không dùng lại bản `AdminServerAppKeys.tsx` thiếu 2 field credit của package payload. Chỉ cần thiếu 1 lần là `server_app_reward_packages` sẽ nổ not-null ngay.\n3. Khi đổi flow free, phải xem cùng lúc 4 điểm: `FreeLanding.tsx`, `FreeGate.tsx`, `FreeClaim.tsx`, `src/lib/freeFlow.ts`. Không sửa lẻ từng file.\n4. Với Find Dumps, ưu tiên cấu trúc mở: map theo `app_code`, tránh hard-code đóng để sau này thêm app mới không gãy layout và logic.\n5. Sau khi sửa frontend, luôn build và redeploy web host. Chỉ deploy Supabase thì không cập nhật được lỗi giao diện.\n\n## Chỗ vừa chỉnh thêm\n\n- `/free`:\n  - Ẩn box lớn `Nhánh riêng cho Find Dumps`.\n  - Thêm box nhỏ dưới `Thiết bị hiện tại` để hiện tên key theo app và quota thiết bị/IP theo key hiện tại.\n- `AdminServerAppDetail.tsx`:\n  - Các ô decimal ở Plans, Features, Wallet, Rewards đều hỗ trợ gõ số thập phân trên mobile.\n\n## Nên test lại\n\n1. `/free` với key Free Fire và Find Dumps xem box tên key đổi đúng chưa.\n2. `/free` xem giới hạn thiết bị/IP đổi theo app hiện tại chưa.\n3. `Admin > Apps > Find Dumps > Cấu hình` thử gõ `1.5`, `0.45`, `2,75` vào các ô decimal và bấm lưu.\n4. Test lại `Get Key` cho cả Free Fire và Find Dumps sau mỗi lần sửa flow FREE.\n''', encoding='utf-8')

print('OK')
