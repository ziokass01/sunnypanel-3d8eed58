# Phase 12: revert UI to phase10 baseline and fix ops bridge

- Base taken from phase10 mobile-tabs build, not phase11 anti-abuse UI.
- Keep only config/runtime on app domain.
- No workspace button or dashboard layer.
- Runtime ops calls use postFunction with admin session JWT.
- server-app-runtime-ops uses local auth-fixed file that already passed live curl.
