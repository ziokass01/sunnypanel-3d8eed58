# Rent Portal Vitest Alias Fix - 2026-05-07

## Lỗi gặp phải

Khi chạy `npm test`/`vitest run`, suite `src/test/rent-portal.test.ts` fail ở bước transform:

```txt
Failed to resolve import "@/lib/functions" from "src/pages/RentPortal.tsx"
```

## Nguyên nhân

`vite.config.ts` đã có alias `@ -> ./src`, nhưng `vitest.config.ts` là config riêng cho Vitest và chưa khai báo lại `resolve.alias`.

Vì vậy khi test import `src/pages/RentPortal.tsx`, Vitest không biết `@/lib/functions` trỏ về `src/lib/functions.ts`.

## Cách fix

Thêm vào `vitest.config.ts`:

```ts
import { fileURLToPath, URL } from "node:url";

resolve: {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
  },
},
```

## Phạm vi ảnh hưởng

Chỉ sửa cấu hình test/build tool. Không đụng logic app, không đụng Supabase functions, không thay đổi luồng Rent Portal hay AI sync.

## Kiểm tra lại

Chạy:

```bash
npm test
```

Nếu cache Vitest/Vite còn cũ trên Termux thì xóa cache rồi chạy lại:

```bash
rm -rf node_modules/.vite node_modules/.vitest .vite dist
npm test
```
