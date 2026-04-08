// LoginUI_RentVerify_Template.h
// Template C++ KHÔNG chứa bí mật. Bạn chỉ điền đúng chỗ <...>.

#pragma once
#include <string>
#include <stdint.h>
#include <time.h>

// 1) Endpoint:
static inline const char* RENT_VERIFY_URL() {
    return "https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/rent-verify-key";
}

// 2) device_id (Android ID hoặc ID bạn tự tạo):
static inline std::string GetDeviceId() {
    // TODO: return "<device_id>";
    return "";
}

// 3) Không hardcode secret trong client.
static inline std::string LoadUserHmacSecret(const std::string& username) {
    (void)username;
    // TODO: lấy secret/ticket từ server theo phiên ngắn hạn (khuyến nghị)
    return "";
}

// 4) Chuỗi ký: username|key|device_id|ts
static inline std::string BuildSignMessage(
    const std::string& username,
    const std::string& key,
    const std::string& device_id,
    int64_t ts
) {
    return username + "|" + key + "|" + device_id + "|" + std::to_string(ts);
}

// 5) HMAC_SHA256_HEX(secret, message) -> hex lowercase
static inline std::string HmacSha256Hex(const std::string& secret, const std::string& message) {
    (void)secret; (void)message;
    // TODO: implement HMAC-SHA256 và trả về hex
    return "<HMAC_SHA256_HEX>";
}

// 6) Build JSON body gửi lên Supabase function
static inline std::string BuildVerifyJson(
    const std::string& username,
    const std::string& key
) {
    const std::string device_id = GetDeviceId();
    const int64_t ts = (int64_t)time(nullptr);

    const std::string secret = LoadUserHmacSecret(username);
    const std::string msg = BuildSignMessage(username, key, device_id, ts);
    const std::string sig = HmacSha256Hex(secret, msg);

    std::string json = "{";
    json += "\"username\":\"" + username + "\",";
    json += "\"key\":\"" + key + "\",";
    json += "\"device_id\":\"" + device_id + "\",";
    json += "\"ts\":" + std::to_string(ts) + ",";
    json += "\"sig\":\"" + sig + "\"";
    json += "}";
    return json;
}
