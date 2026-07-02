# Fix GitHub Actions: Supabase CLI command not found

## Lỗi gốc

Workflow dùng:

```yaml
uses: supabase/setup-cli@v1
with:
  version: latest
```

Bước action bị lỗi khi gọi GitHub API để tìm bản CLI mới nhất. Vì bước cài đặt chưa hoàn tất nên mọi bước sau đều nhận:

```text
supabase: command not found
exit code 127
```

## Đã sửa

- Chuyển cả hai workflow sang `supabase/setup-cli@v2`.
- Ghim CLI ở phiên bản `2.84.2`, không còn phụ thuộc việc tra `latest`.
- Truyền `github-token: ${{ github.token }}`.
- Thêm bước `supabase --version` để dừng sớm nếu CLI chưa được cài.
- Kiểm tra ba secret bắt buộc trước khi link project.
- Thêm `--project-ref` khi ghi function secrets.
- Thêm `admin-free-shortlinks` vào workflow deploy functions thường ngày.
- Chỉ để workflow Functions chạy khi push `main`; workflow DB + Functions chuyển sang chạy thủ công để tránh hai workflow cùng deploy một lúc.
- Dùng chung concurrency group để các deploy production không chạy chồng lên nhau.

## Workflow sau sửa

- Push lên `main`: chạy `Deploy Supabase Edge Functions`.
- Muốn push migration: mở Actions và chạy thủ công `Manual Supabase DB Push + Edge Functions`, chọn `run_db_push=true`.
