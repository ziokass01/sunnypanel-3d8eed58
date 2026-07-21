# Experimental dependency branch

The stable V34 login path uses Android platform TLS and ECDSA. It does not require the bundled OpenSSL/curl for login.

For a later binary-only migration branch, target:

- curl 8.21.0 or later stable release;
- OpenSSL 3.5 LTS or later compatible LTS release;
- a modern Android NDK supported by the project's minimum API and all virtual-space targets.

Required validation before importing new `.a` archives:

1. arm64-v8a and armeabi-v7a clean link;
2. Android 8–current launch and TLS tests;
3. each supported virtual space;
4. no duplicate OpenSSL symbols or ABI mismatch;
5. login, local EXP, Cache-disabled UI, Firewall, Aim/ESP smoke tests;
6. ELF RELRO/BIND_NOW/NX/export checks.

Do not replace static archives in the stable branch without those runtime tests. An untested crypto archive is a larger operational risk than leaving the non-authoritative legacy path isolated.
