#pragma once
/*
    SunnyAntiCrack.h
    Drop-in guard for SunnyLoginModule.hpp.

    What it blocks:
      - curl URL replacement tools (CURLOPT_URL hook) by validating effective URL host.
      - simple HTTPS/proxy/cache fake responses by requiring a server-signed ok response.
      - the known public URL-hook samples that redirect to fake login API domains.

    Important:
      - This does NOT check APK signature, so it still works for your virtual-space/lib-transfer flow.
      - Server must include server_sig for ok=true responses. See verify-key_index_SIGNED_RESPONSE.ts.
*/

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

#include <curl/curl.h>

#ifdef __ANDROID__
#include <unistd.h>
#endif

namespace SunnyAntiCrack {

static inline const char* OfficialHost() { return "mityangho.id.vn"; }
static inline const char* BuildId()      { return "sunny-v31-ac-20260616"; }
static inline const char* SigAlg()       { return "HMAC-SHA256-V1"; }

static inline std::string ToLower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return (char)std::tolower(c); });
    return s;
}

static inline bool StartsWithI(const std::string& s, const std::string& p) {
    if (s.size() < p.size()) return false;
    for (size_t i = 0; i < p.size(); ++i) {
        if (std::tolower((unsigned char)s[i]) != std::tolower((unsigned char)p[i])) return false;
    }
    return true;
}

static inline bool ContainsI(const std::string& s, const std::string& needle) {
    if (needle.empty()) return true;
    return ToLower(s).find(ToLower(needle)) != std::string::npos;
}

static inline std::string ExtractHostFromUrl(const std::string& url) {
    size_t scheme = url.find("://");
    if (scheme == std::string::npos) return "";
    std::string proto = ToLower(url.substr(0, scheme));
    if (proto != "https") return "";
    size_t host_start = scheme + 3;
    size_t host_end = url.find_first_of("/:?#", host_start);
    std::string host = url.substr(host_start, host_end == std::string::npos ? std::string::npos : host_end - host_start);
    size_t at = host.rfind('@');
    if (at != std::string::npos) host = host.substr(at + 1);
    size_t colon = host.find(':');
    if (colon != std::string::npos) host = host.substr(0, colon);
    return ToLower(host);
}

static inline bool IsOfficialUrl(const std::string& url) {
    const std::string host = ExtractHostFromUrl(url);
    return !host.empty() && host == ToLower(OfficialHost());
}

static inline bool ValidateConfiguredUrl(const std::string& url, std::string* err = nullptr) {
    if (!StartsWithI(url, "https://")) {
        if (err) *err = "APP_GUARD_HTTP_BLOCKED";
        return false;
    }
    if (!IsOfficialUrl(url)) {
        if (err) *err = "APP_GUARD_BAD_API_HOST";
        return false;
    }
    return true;
}

static inline bool ValidateEffectiveUrl(const std::string& url, std::string* err = nullptr) {
    if (!ValidateConfiguredUrl(url, err)) {
        if (err && err->empty()) *err = "APP_GUARD_EFFECTIVE_URL_BLOCKED";
        return false;
    }
    return true;
}

static inline void ApplyCurlHardening(CURL* curl) {
    if (!curl) return;

    // No redirect: a valid endpoint must answer directly.
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(curl, CURLOPT_MAXREDIRS, 0L);

    // Disable environment/user proxy for login verification.
    curl_easy_setopt(curl, CURLOPT_PROXY, "");
    curl_easy_setopt(curl, CURLOPT_NOPROXY, "*");

    // Strict TLS only. Never allow release builds to retry insecure.
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);

#ifdef CURLOPT_PROTOCOLS
    curl_easy_setopt(curl, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
#endif
#ifdef CURLOPT_REDIR_PROTOCOLS
    curl_easy_setopt(curl, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTPS);
#endif
#ifdef CURLOPT_PROTOCOLS_STR
    curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, "https");
#endif
#ifdef CURLOPT_REDIR_PROTOCOLS_STR
    curl_easy_setopt(curl, CURLOPT_REDIR_PROTOCOLS_STR, "https");
#endif

    curl_easy_setopt(curl, CURLOPT_FRESH_CONNECT, 1L);
    curl_easy_setopt(curl, CURLOPT_FORBID_REUSE, 1L);
#ifdef CURLOPT_SSL_SESSIONID_CACHE
    curl_easy_setopt(curl, CURLOPT_SSL_SESSIONID_CACHE, 0L);
#endif
#ifdef CURLOPT_DNS_CACHE_TIMEOUT
    curl_easy_setopt(curl, CURLOPT_DNS_CACHE_TIMEOUT, 0L);
#endif
}

static inline bool DetectKnownUrlHookTool(std::string* reason = nullptr) {
#ifdef __ANDROID__
    FILE* fp = std::fopen("/proc/self/maps", "r");
    if (!fp) return false;
    char line[1024];
    const char* bad[] = {
        "api.obbvip.online",
        "hmw.io.vn",
        "a-s-cracks.top",
        "public/connect",
        "hook url",
        "offset hook url",
        "libnta64",
        "killer_mod"
    };
    while (std::fgets(line, sizeof(line), fp)) {
        std::string s(line);
        for (const char* b : bad) {
            if (ContainsI(s, b)) {
                std::fclose(fp);
                if (reason) *reason = std::string("APP_GUARD_TOOL_ARTIFACT:") + b;
                return true;
            }
        }
    }
    std::fclose(fp);
#else
    (void)reason;
#endif
    return false;
}

static inline bool JsonFindToken(const std::string& json, const char* key, std::string& out) {
    out.clear();
    std::string pat = std::string("\"") + key + "\"";
    size_t p = json.find(pat);
    if (p == std::string::npos) return false;
    p = json.find(':', p + pat.size());
    if (p == std::string::npos) return false;
    ++p;
    while (p < json.size() && std::isspace((unsigned char)json[p])) ++p;
    if (p >= json.size()) return false;

    if (json[p] == '"') {
        ++p;
        std::string v;
        bool esc = false;
        for (; p < json.size(); ++p) {
            char c = json[p];
            if (esc) {
                switch (c) {
                    case '"': v.push_back('"'); break;
                    case '\\': v.push_back('\\'); break;
                    case '/': v.push_back('/'); break;
                    case 'b': v.push_back('\b'); break;
                    case 'f': v.push_back('\f'); break;
                    case 'n': v.push_back('\n'); break;
                    case 'r': v.push_back('\r'); break;
                    case 't': v.push_back('\t'); break;
                    default: v.push_back(c); break;
                }
                esc = false;
            } else if (c == '\\') {
                esc = true;
            } else if (c == '"') {
                out = v;
                return true;
            } else {
                v.push_back(c);
            }
        }
        return false;
    }

    size_t e = json.find_first_of(",}", p);
    if (e == std::string::npos) e = json.size();
    while (e > p && std::isspace((unsigned char)json[e - 1])) --e;
    out = json.substr(p, e - p);
    return true;
}

static inline bool TimingSafeEqual(const std::string& a, const std::string& b) {
    if (a.size() != b.size()) return false;
    unsigned char r = 0;
    for (size_t i = 0; i < a.size(); ++i) r |= (unsigned char)(std::tolower((unsigned char)a[i]) ^ std::tolower((unsigned char)b[i]));
    return r == 0;
}

static inline std::string SignedResponseCanonical(const std::string& nonce,
                                                  const std::string& key,
                                                  const std::string& device,
                                                  const std::string& build_id,
                                                  const std::string& ok_token,
                                                  const std::string& remaining_token,
                                                  const std::string& expires_at,
                                                  const std::string& server_time) {
    return std::string("v1\n") + nonce + "\n" + key + "\n" + device + "\n" +
           build_id + "\n" + ok_token + "\n" + remaining_token + "\n" +
           expires_at + "\n" + server_time;
}

static inline bool VerifySignedOkResponse(const std::string& json,
                                           const std::string& request_nonce,
                                           const std::string& key,
                                           const std::string& device,
                                           const std::string& expected_build_id,
                                           const std::function<std::string(const std::string&)>& hmac_sha256_hex,
                                           std::string* err = nullptr) {
    std::string okTok;
    if (!JsonFindToken(json, "ok", okTok) || ToLower(okTok) != "true") {
        return true; // failed login responses do not need a signature; they cannot grant access.
    }

    std::string alg, sig, build, rem, exp, serverTime;
    if (!JsonFindToken(json, "server_sig_alg", alg) || alg != SigAlg()) {
        if (err) *err = "SERVER_SIG_ALG_MISSING";
        return false;
    }
    if (!JsonFindToken(json, "server_sig", sig) || sig.size() != 64) {
        if (err) *err = "SERVER_SIG_MISSING";
        return false;
    }
    if (!JsonFindToken(json, "build_id", build) || build != expected_build_id) {
        if (err) *err = "SERVER_BUILD_MISMATCH";
        return false;
    }
    if (!JsonFindToken(json, "remaining_seconds", rem) || rem.empty() || ToLower(rem) == "null") {
        if (err) *err = "SERVER_REMAINING_MISSING";
        return false;
    }
    if (!JsonFindToken(json, "expires_at", exp)) exp.clear();
    if (ToLower(exp) == "null") exp.clear();
    if (!JsonFindToken(json, "server_time", serverTime) || serverTime.empty()) {
        if (err) *err = "SERVER_TIME_MISSING";
        return false;
    }

    const std::string canonical = SignedResponseCanonical(request_nonce, key, device, build, "true", rem, exp, serverTime);
    const std::string expect = hmac_sha256_hex(canonical);
    if (!TimingSafeEqual(expect, sig)) {
        if (err) *err = "SERVER_SIG_BAD";
        return false;
    }
    return true;
}

} // namespace SunnyAntiCrack
