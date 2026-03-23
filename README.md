# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Free key flow manual test checklist

- [ ] **Normal flow**: `/free` -> chọn loại key -> Get Key -> vượt Link4M -> `/free/gate` -> `/free/claim` -> bấm **Verify** -> nhận key -> bấm **Copy** -> auto quay lại `/free`.
- [ ] **TOO_FAST**: vượt link quá nhanh, server trả `TOO_FAST`, UI hiển thị: **"Xác thực không thành công. Vui lòng vượt lại."**.
- [ ] **Reload gate**: reload `/free/gate` nhiều lần không được xoay token vô hạn; không tự chờ đủ thời gian để pass.
- [ ] **Reload claim**: sau khi reveal thành công, reload `/free/claim` không được tạo key mới; chỉ hiển thị lại key cũ cùng session.
- [ ] **Reveal twice**: bấm Verify/retry nhiều lần chỉ trả cùng key đã reveal (không phát hành key mới).
- [ ] **Missing claim**: vào `/free/claim` không có `?c=` hoặc `?claim=` phải báo phiên không hợp lệ và cho quay lại `/free`.
- [ ] **Admin run test flow**: tại `/admin/free-keys`, đăng nhập admin, bật test mode và bấm **Run test flow** phải chạy qua start -> gate -> reveal thành công.
- [ ] **Rate limit**: spam `free-start/free-gate/free-reveal` vượt ngưỡng sẽ trả `RATE_LIMIT`.
- [ ] **Blocklist**: ban fingerprint/ip ở admin monitor, flow free sau đó phải bị chặn (`BLOCKED`).
