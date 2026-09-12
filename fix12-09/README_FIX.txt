SUNNYPANEL - FIX HIEN SO KEY CON LAI HOM NAY (2026-08-12)

Pham vi:
- Chi sua giao dien va lich su quota tren trinh duyet.
- Khong thay server VPS, Nginx, FREE API, verify-key hay menu V10.4.
- Giu cache chung chong DDoS; khong bat lai cache theo IP/fingerprint.

Ket qua:
- Khi cache chung an quota ca nhan, giao dien tinh so con lai tu gioi han da cau hinh
  va so key thanh cong cua dung app tren thiet bi hien tai.
- Neu backend tra quota that, so tu backend luon duoc uu tien.
- Quota bang 0/0 hien ky hieu vo han thay vi dau tru.
- Lich su cu duoc chuyen an toan ve bucket Free Fire; app khac khong bi tru nham.
- Server van la noi quyet dinh va chan quota that khi nguoi dung nhan key.

CAI TU TERMUX VA PUSH GITHUB

1. Vao repo SunnyPanel da clone:
   cd /duong-dan/toi/repo

2. Tao thu muc tam va giai nen goi fix (doi duong dan Downloads neu can):
   FIX_TMP="$(mktemp -d)"
   unzip -o "$HOME/storage/downloads/SunnyPanel_FIX_SO_KEY_HOM_NAY_20260812.zip" -d "$FIX_TMP"

3. Chep dung cac file sua vao repo:
   cp -R "$FIX_TMP/quota_today_fix_20260812/src/." ./src/

4. Kiem tra truoc khi push:
   npm install
   npm test -- --run src/test/free-quota-display.test.ts src/test/free-history-quota.test.tsx
   npm run build
   git status --short

5. Push dung nhanh hien tai:
   git add src/features/free/quota-display.ts src/features/free/flow-ux.tsx src/pages/FreeLanding.tsx src/pages/FreeClaim.tsx src/test/free-quota-display.test.ts src/test/free-history-quota.test.tsx
   git commit -m "fix: show today's remaining free-key quota"
   git push origin "$(git branch --show-current)"

Sau khi Vercel deploy xong, mo trang /free va hard refresh. Neu trinh duyet con asset cu,
xoa cache cua rieng mityangho.id.vn roi mo lai.
