Binary Workspace phase 2.x runtime sync

New default feature templates added for app_code find-dumps:
- binary_scan_quick
- binary_scan_full
- ida_export_import
- ida_workspace_save
- ida_workspace_restore
- ida_workspace_export
- workspace_batch
- workspace_note
- workspace_export_result
- workspace_browser
- workspace_diff

Meaning
- workspace_browser covers Browser + Pseudo / decompile-lite in the Android client.
- ida_workspace_restore is reused for loading from internal storage and importing snapshot files.
- Admin can tune costs/plan gates later in AdminServerAppDetail / AdminServerAppCharge.

Domain/runtime mapping remains:
- public API runtime: https://mityangho.id.vn/api/server-app-runtime
- public ops: https://mityangho.id.vn/api/server-app-runtime-ops
- app auth base: https://app.mityangho.id.vn
