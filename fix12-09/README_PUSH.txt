Copy these files into your repo exactly:
- src/App.tsx
- src/pages/Login.tsx
- src/pages/AdminServerAppRuntime.tsx
- src/pages/AdminServerAppTrash.tsx

Then:
git add src/App.tsx src/pages/Login.tsx src/pages/AdminServerAppRuntime.tsx src/pages/AdminServerAppTrash.tsx
git commit -m "fix app-domain admin jwt bridge and runtime/trash auth refresh"
git pull --rebase origin main
git push origin main
