#pragma once
/*
    SunnyLoginModule.hpp
    - Single-file login + login UI module for ImGui overlays on Android/Unity
    - Cleaned from unrelated hook/game/menu boilerplate
    - Keeps:
        * remote login flow
        * login UI
        * saved key + auto login config
        * license HUD
        * periodic re-verify polling
        * 9-tap hide controller, isolated in its own block but still linked

    Minimal integration:
        1) include this file in main
        2) call SunnyLogin::InitJavaVM(vm) when you have JavaVM
        3) optionally call SunnyLogin::SetActivity(env, activity)
        3.5) if you already resolve Unity Application.OpenURL in main, bind it once:
              SunnyLogin::SetUnityOpenUrlCallbacks((SunnyLogin::UnityCreateStringFn)CreateIl2cppString,
                                                 (SunnyLogin::UnityOpenUrlFn)OpenURL);
        4) each frame:
              SunnyLogin::Tick();
              if (SunnyLogin::Hide9().ConsumeFrameIfHidden([]{
                      ImGui::Render();
                      ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
                  })) {
                  return old_eglSwapBuffers(dpy, surface);
              }

              SunnyLogin::Draw();

        5) when login succeeds, your main code can check:
              if (SunnyLogin::IsLoggedIn()) { ... draw main menu ... }

    Notes:
        - This file intentionally does NOT contain game feature menu code.
        - This file intentionally does NOT contain zygisk, patchLib, RAM/storage, etc.
        - The 9-tap hide logic is kept in a dedicated block: Hide9Controller.
*/

#include <imgui.h>
#include <curl/curl.h>

#include <array>
#include <atomic>
#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <functional>
#include <cmath>
#include <cstdarg>
#include <ctime>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#ifdef __ANDROID__
    #include <sys/stat.h>
#endif
#include <utility>
#include <vector>

#ifdef __ANDROID__
    #include <jni.h>
    #include <unistd.h>
    #include <fcntl.h>
    #include <android/log.h>
#endif

#if defined(__has_include)
    #if __has_include("SunnyCABundle.h")
        #include "SunnyCABundle.h"
        #define SUNNY_LOGIN_HAS_EMBEDDED_CA 1
    #else
        #define SUNNY_LOGIN_HAS_EMBEDDED_CA 0
        static const char* SUNNY_CA_BUNDLE_PEM = "";
    #endif
#else
    #define SUNNY_LOGIN_HAS_EMBEDDED_CA 0
    static const char* SUNNY_CA_BUNDLE_PEM = "";
#endif

#if defined(__GNUC__) || defined(__clang__)
    #define SLX9_FORCE_INLINE static inline __attribute__((always_inline))
#else
    #define SLX9_FORCE_INLINE static inline
#endif

namespace SLX9 {

namespace detail {
SLX9_FORCE_INLINE uint32_t Mix32(uint32_t x) {
    x ^= x >> 16;
    x *= 0x7feb352du;
    x ^= x >> 15;
    x *= 0x846ca68bu;
    x ^= x >> 16;
    return x;
}

SLX9_FORCE_INLINE uint8_t StepKey(uint32_t seed, size_t i, size_t n, uint8_t prev) {
    uint32_t x = seed ^ 0x9E3779B9u ^ (uint32_t)(n * 0x85EBCA6Bu);
    x += (uint32_t)((i + 1u) * 0xC2B2AE35u);
    x ^= (uint32_t)(((i * i + 17u) << 7u));
    x = Mix32(x ^ ((uint32_t)prev << 24u) ^ (uint32_t)((n - i) * 0x27D4EB2Du));
    return (uint8_t)(x ^ (x >> 8u) ^ (x >> 16u) ^ (x >> 24u));
}

SLX9_FORCE_INLINE std::string Dec(const uint8_t* p, size_t n, uint32_t seed) {
    std::string out;
    out.resize(n);
    uint8_t prev = (uint8_t)(Mix32(seed ^ (uint32_t)(n * 0x9E3779B9u)) & 0xffu);
    for (size_t i = 0; i < n; ++i) {
        const uint8_t k = StepKey(seed, i, n, prev);
        const uint8_t m = (uint8_t)(prev + (uint8_t)(i * 29u) + (uint8_t)((seed >> ((i & 3u) * 8u)) & 0xffu) + (uint8_t)((n - i) & 0xffu));
        const uint8_t c = p[i];
        const uint8_t plain = (uint8_t)(c ^ k ^ m);
        out[i] = (char)plain;
        prev = (uint8_t)(c + plain + k + 0x5Du);
    }
    return out;
}

SLX9_FORCE_INLINE void WipeString(std::string& s) {
    if (s.empty()) return;
    volatile char* p = const_cast<volatile char*>(s.data());
    for (size_t i = 0; i < s.size(); ++i) p[i] = 0;
    s.clear();
}
} // namespace detail

namespace lit {
SLX9_FORCE_INLINE std::string X000() {
    static const uint8_t v[] = {0x19, 0x8E, 0x1B, 0xCB, 0xEF, 0xCB, 0x54, 0xC2, 0x9E, 0x21, 0x6B, 0x2F, 0x0D, 0xDB, 0x05, 0xE3, 0xF2, 0xB4, 0x73, 0xC7, 0x97, 0x44, 0x80, 0x5E, 0x21, 0x60, 0x17, 0xB1, 0x36, 0x0F, 0xA9, 0x44, 0x47, 0x7A, 0xED, 0x53, 0x79, 0xE1};
    return detail::Dec(v, sizeof(v), 0xB4DF692Fu);
}

SLX9_FORCE_INLINE std::string X001() {
    static const uint8_t v[] = {0x42, 0x8B, 0xB4, 0x3A, 0x9A, 0xC4, 0x77, 0xBD, 0x46, 0x0B, 0x72, 0x81, 0x8E, 0xED, 0x53, 0xE0, 0x46, 0xD9, 0x25, 0xC8, 0x22, 0x4B, 0x20, 0xCE, 0x39, 0xFE, 0xEB, 0xB7};
    return detail::Dec(v, sizeof(v), 0x09CC310Eu);
}

SLX9_FORCE_INLINE std::string X002() {
    static const uint8_t v[] = {0x6A, 0xF1, 0xA7, 0xE0, 0xEA, 0xCE, 0xB2, 0xC4, 0xA1, 0x15, 0x49, 0xD0, 0xC1, 0x4C, 0x12, 0xEB, 0x40, 0xE0, 0x62, 0xDC, 0x30, 0xC5, 0xF3, 0xCD, 0xCF, 0xB6, 0x35, 0x95, 0x42, 0x8E};
    return detail::Dec(v, sizeof(v), 0x72859890u);
}

SLX9_FORCE_INLINE std::string X003() {
    static const uint8_t v[] = {0x72, 0x0D, 0x6E, 0x49, 0xCC, 0xCA, 0x17, 0xA3, 0xDF, 0x12, 0xC9, 0xA5, 0x93, 0x0F, 0xBE, 0x38, 0x55, 0x08, 0xE0, 0x8F, 0x74, 0x0A, 0xA0, 0xFB, 0xBD, 0xFB, 0xD0, 0x9A, 0x8A, 0x05, 0x0A, 0xC9, 0x81, 0xD4, 0x51, 0xD5, 0xC2, 0x7B, 0xED, 0xB0, 0x28, 0x5A, 0x46, 0x92};
    return detail::Dec(v, sizeof(v), 0xC30F6EAAu);
}

SLX9_FORCE_INLINE std::string X004() {
    static const uint8_t v[] = {0xC6, 0x5C, 0xEA, 0x5A, 0x93, 0x96, 0x7C, 0x28, 0xAA, 0xAD, 0xA8, 0x0C, 0x00, 0x93, 0x85, 0xE9, 0xC2, 0x7A, 0x0B, 0x32, 0x4F, 0x95, 0x27, 0xFE, 0xB1, 0xDA, 0xDC};
    return detail::Dec(v, sizeof(v), 0x3F9F6E4Bu);
}

SLX9_FORCE_INLINE std::string X005() {
    static const uint8_t v[] = {0xC7, 0xEE, 0xA7, 0xB8, 0xA9, 0xA8, 0x3F, 0x12, 0x92, 0xA8, 0xD5, 0x01, 0xB8, 0x52, 0x89, 0x05, 0xD4, 0x2F, 0x11};
    return detail::Dec(v, sizeof(v), 0xAE70573Cu);
}

SLX9_FORCE_INLINE std::string X006() {
    static const uint8_t v[] = {0x4D, 0xF2, 0x10, 0xD7, 0x01, 0x86, 0xFF, 0x82, 0xA5, 0xFD, 0xE5, 0x49, 0x17, 0x5A, 0x38, 0x0C, 0x8A, 0xF1, 0x3A};
    return detail::Dec(v, sizeof(v), 0x2E871AA0u);
}

SLX9_FORCE_INLINE std::string X007() {
    static const uint8_t v[] = {0x99, 0xA2, 0xD2, 0xFA, 0x64, 0x55, 0xF6, 0xFB, 0x5D, 0x4F, 0x69, 0xAA, 0xAF, 0x32, 0xAC, 0x0C, 0xBD, 0xEE, 0xC6, 0xC2, 0xC0, 0xEE, 0xE7, 0xEB, 0x3D, 0x16, 0x1F, 0x71, 0x9F, 0x86};
    return detail::Dec(v, sizeof(v), 0xB5B57BE0u);
}

SLX9_FORCE_INLINE std::string X008() {
    static const uint8_t v[] = {0x71, 0x6B, 0x05, 0x14, 0x15, 0x02};
    return detail::Dec(v, sizeof(v), 0x34E0A161u);
}

SLX9_FORCE_INLINE std::string X009() {
    static const uint8_t v[] = {0xA1, 0xBF};
    return detail::Dec(v, sizeof(v), 0xFC69CC5Du);
}

SLX9_FORCE_INLINE std::string X010() {
    static const uint8_t v[] = {0xD1, 0xF6, 0x3E, 0xC9, 0x3B, 0x10, 0x95, 0x26, 0xA8, 0x31, 0xC7, 0xA0, 0x04};
    return detail::Dec(v, sizeof(v), 0x249F69C8u);
}

SLX9_FORCE_INLINE std::string X011() {
    static const uint8_t v[] = {0x61, 0x32, 0x86, 0x65, 0xCE, 0x76, 0x65, 0x10, 0x20, 0xD5, 0xF4, 0xEB, 0x1A, 0x43, 0x34, 0x29, 0x03, 0x9B, 0x40, 0x84, 0x6C, 0x5B, 0xCE};
    return detail::Dec(v, sizeof(v), 0x194A2A83u);
}

SLX9_FORCE_INLINE std::string X012() {
    static const uint8_t v[] = {0x9A, 0x6E, 0xA2, 0x64, 0x93, 0xBD, 0xDE, 0x6F, 0x5F, 0xD3, 0x47};
    return detail::Dec(v, sizeof(v), 0xF7D4347Bu);
}

SLX9_FORCE_INLINE std::string X013() {
    static const uint8_t v[] = {0xBD, 0x29, 0x86, 0x32, 0xC7, 0xE9, 0xD7, 0xB0, 0x7D, 0x95, 0xAB, 0x00, 0xD8, 0x93, 0x05, 0xC9, 0xDE, 0x13, 0xD2, 0x1E};
    return detail::Dec(v, sizeof(v), 0x3B86ED66u);
}

SLX9_FORCE_INLINE std::string X014() {
    static const uint8_t v[] = {0x7D, 0x4D, 0xCE, 0x83, 0x6C, 0xA5, 0x25, 0x45, 0x84, 0xB1, 0x13};
    return detail::Dec(v, sizeof(v), 0x532B13A5u);
}

SLX9_FORCE_INLINE std::string X015() {
    static const uint8_t v[] = {0x3D, 0xEB, 0x68, 0xA4, 0x02, 0x74, 0x9F, 0xDC, 0x02, 0x8B, 0x63, 0x0A, 0x0E, 0xA9, 0x89, 0xA4, 0x0D, 0xB1, 0x55, 0x47, 0x5B};
    return detail::Dec(v, sizeof(v), 0xD174A144u);
}

SLX9_FORCE_INLINE std::string X016() {
    static const uint8_t v[] = {0x24, 0x5D, 0xB1, 0x84, 0x69, 0xDA, 0x3C, 0xB9, 0x4B, 0x8F, 0xF0, 0x04};
    return detail::Dec(v, sizeof(v), 0x6DB7D779u);
}

SLX9_FORCE_INLINE std::string X017() {
    static const uint8_t v[] = {0x8A, 0x47, 0x38, 0xF3, 0xF9, 0xD9, 0x27, 0xA0, 0x9E, 0x99, 0x7A, 0xD3, 0xBE, 0xA7, 0xB6, 0xFF, 0xC4, 0xD4, 0x19, 0x62, 0x75, 0x46, 0xED, 0x1E, 0x3D, 0x44, 0x93, 0xB1, 0x1C, 0x9F, 0x35, 0xC0, 0xC9};
    return detail::Dec(v, sizeof(v), 0xFE34B0B4u);
}

SLX9_FORCE_INLINE std::string X018() {
    static const uint8_t v[] = {0xA8, 0x32, 0x2F, 0x00, 0xEF, 0x78, 0x66, 0x02, 0x6F, 0x6C};
    return detail::Dec(v, sizeof(v), 0xC9465BC1u);
}

SLX9_FORCE_INLINE std::string X019() {
    static const uint8_t v[] = {0x70, 0x11, 0x13, 0xEB, 0xC9, 0xA1, 0xAA, 0x61, 0x9F, 0x66, 0xC7, 0xB5, 0xB7, 0x32, 0x46, 0x1D};
    return detail::Dec(v, sizeof(v), 0x972DB960u);
}

SLX9_FORCE_INLINE std::string X020() {
    static const uint8_t v[] = {0xA9, 0xE8, 0x94, 0x6A, 0x84, 0x0A, 0x3C, 0xB4, 0x1D, 0x2C, 0x64, 0x80};
    return detail::Dec(v, sizeof(v), 0xEB7E6E68u);
}

SLX9_FORCE_INLINE std::string X021() {
    static const uint8_t v[] = {0xEC, 0xD3, 0xAC, 0x3D, 0x31, 0x1F, 0xBA, 0x2F, 0x3F, 0x00, 0x2D, 0xCC, 0xB0, 0x85, 0x5D, 0x77, 0x43, 0x45, 0x21, 0x48, 0xD8, 0x07, 0x58, 0xD6, 0x85, 0x9F, 0x0E, 0xE4, 0x3E, 0x42, 0xA8, 0x3C, 0xD4, 0x6F, 0xBF, 0x97, 0xFE, 0x10, 0xD0, 0x21, 0x4C, 0x12, 0x1C};
    return detail::Dec(v, sizeof(v), 0x8E304770u);
}

SLX9_FORCE_INLINE std::string X022() {
    static const uint8_t v[] = {0x13, 0x63, 0x29, 0xFE, 0x60, 0x10, 0x64, 0x45, 0x71, 0xFA, 0xF2, 0x6B, 0x93, 0xD8, 0x32, 0xE5, 0x7E, 0x1A, 0xD4, 0x03, 0x7C};
    return detail::Dec(v, sizeof(v), 0x5E2C46DAu);
}

SLX9_FORCE_INLINE std::string X023() {
    static const uint8_t v[] = {0x3B, 0x15, 0x53, 0xBF, 0xE7, 0x08, 0x51, 0x18, 0xAE, 0xFC, 0x4E, 0x49, 0x00, 0xCA, 0x54, 0x8B, 0x29, 0x7D, 0xF8, 0xAB, 0xB3, 0x31};
    return detail::Dec(v, sizeof(v), 0xFA233CABu);
}

SLX9_FORCE_INLINE std::string X024() {
    static const uint8_t v[] = {0xBD, 0xAE, 0x4D, 0x4B, 0x5F, 0x40, 0xB7, 0xDB, 0x4E, 0xC5, 0x58, 0x94};
    return detail::Dec(v, sizeof(v), 0xD1A6E5D2u);
}

SLX9_FORCE_INLINE std::string X025() {
    static const uint8_t v[] = {0x48, 0xEC, 0xEB, 0x86, 0xA0, 0x25, 0xD3, 0xAE, 0xAD, 0x21, 0x75, 0x90, 0x71};
    return detail::Dec(v, sizeof(v), 0xECDE9D40u);
}

SLX9_FORCE_INLINE std::string X026() {
    static const uint8_t v[] = {0xEF, 0xB6, 0x08, 0xC4, 0x06, 0xAD, 0x54, 0x47, 0xC2, 0x04, 0x6D, 0x31, 0x70};
    return detail::Dec(v, sizeof(v), 0x52EA21FAu);
}

SLX9_FORCE_INLINE std::string X027() {
    static const uint8_t v[] = {0x2B, 0x3A, 0xF2, 0xFF, 0xD8, 0x38, 0xF5, 0x69, 0x14, 0x37, 0x39, 0x97, 0xF3, 0x4C, 0x26, 0xFC, 0x0B, 0xD3, 0xC1, 0xB1, 0xBB, 0x5D, 0x04, 0x21, 0x12, 0xBD, 0x3F, 0xD2, 0x64, 0x90, 0x11, 0x9D, 0x65, 0x65, 0xF3, 0xCA, 0xD8, 0x18, 0x3C, 0x17, 0x8B};
    return detail::Dec(v, sizeof(v), 0x5B6A5C46u);
}

SLX9_FORCE_INLINE std::string X028() {
    static const uint8_t v[] = {0xE1, 0x88, 0x55, 0x8D, 0x25, 0x6B, 0x9A, 0x56, 0x49, 0x85, 0x6C, 0xA5, 0xC4, 0x2D, 0xF8, 0x3A, 0x88, 0x5D, 0x15, 0xB5, 0x6A, 0x2A, 0xEE, 0x8A, 0x28, 0x32, 0x43, 0x88, 0x25, 0xA0};
    return detail::Dec(v, sizeof(v), 0xC9C15249u);
}

SLX9_FORCE_INLINE std::string X029() {
    static const uint8_t v[] = {0xDE, 0x16, 0x5E, 0xCD, 0xB6, 0xDF, 0x98, 0xA1, 0xC0, 0x00, 0xA0, 0xC4, 0x4F, 0xD9, 0xBD};
    return detail::Dec(v, sizeof(v), 0x746BF1D9u);
}

SLX9_FORCE_INLINE std::string X030() {
    static const uint8_t v[] = {0xCC, 0x3D, 0x21, 0xAD, 0x02, 0x78, 0xF0, 0x11, 0x0C, 0xF5, 0xEA, 0xFE, 0xB2, 0x59, 0x40, 0x90, 0xC9, 0x98, 0x3A, 0x81, 0x89, 0xBC};
    return detail::Dec(v, sizeof(v), 0xE15AFDDDu);
}

SLX9_FORCE_INLINE std::string X031() {
    static const uint8_t v[] = {0x26, 0x7F, 0x44, 0xE9, 0x93, 0x6E, 0x8D, 0xCD, 0x3B, 0xA0, 0xCC, 0xA1, 0xEA, 0x62, 0x9A, 0x6A, 0x16, 0xAF, 0x93, 0xB8, 0xDD, 0xD8, 0x23, 0x98, 0x14, 0xF6};
    return detail::Dec(v, sizeof(v), 0xFF2423EFu);
}

SLX9_FORCE_INLINE std::string X032() {
    static const uint8_t v[] = {0xAB, 0xFD, 0x92, 0x36, 0x53, 0x14, 0x89, 0x30, 0x67, 0xB3, 0xD6, 0x83, 0xAF, 0xA6, 0x08, 0xE9, 0x35, 0xA2, 0x75, 0x83, 0x43};
    return detail::Dec(v, sizeof(v), 0x740D6329u);
}

SLX9_FORCE_INLINE std::string X033() {
    static const uint8_t v[] = {0x82, 0x03, 0xA1, 0x68, 0x59, 0xF4, 0xE9, 0xAB, 0x01, 0xA4, 0xF1, 0x30, 0x74, 0xC7, 0x55, 0xFC, 0x59, 0x84, 0xA6, 0x2A, 0xA0, 0x7E, 0xF7, 0xED, 0xEC, 0x80, 0xC4, 0xBF, 0xA0, 0x4F};
    return detail::Dec(v, sizeof(v), 0xA14D285Cu);
}

SLX9_FORCE_INLINE std::string X034() {
    static const uint8_t v[] = {0x51, 0x7B, 0x2B, 0x57, 0x2B, 0x48, 0x39, 0xE2, 0xED, 0xE6, 0x40, 0xAB, 0xBA, 0x5C};
    return detail::Dec(v, sizeof(v), 0xF2910B4Au);
}

SLX9_FORCE_INLINE std::string X035() {
    static const uint8_t v[] = {0x69, 0xF0, 0x1B, 0x40, 0xC3, 0xFD, 0xD9, 0xB6, 0x28, 0xC9, 0x38, 0x5A, 0xC0, 0x3F, 0x10, 0x1E, 0x3C, 0xA3, 0x07, 0x92, 0x71, 0xE7, 0x7F, 0xEF, 0x07, 0x37, 0x85};
    return detail::Dec(v, sizeof(v), 0x294CA468u);
}

SLX9_FORCE_INLINE std::string X036() {
    static const uint8_t v[] = {0x77, 0x69, 0x12, 0x71, 0x6F, 0x28, 0x2E, 0x06, 0x7A, 0x70, 0xA6};
    return detail::Dec(v, sizeof(v), 0x27D1D070u);
}

SLX9_FORCE_INLINE std::string X037() {
    static const uint8_t v[] = {0x71, 0x4B, 0x73, 0x65, 0x6E, 0x59, 0x6F, 0xF0, 0xE9, 0x5A, 0x67, 0x6A, 0x69, 0x32, 0x3F, 0x40};
    return detail::Dec(v, sizeof(v), 0xF73B69CBu);
}

SLX9_FORCE_INLINE std::string X038() {
    static const uint8_t v[] = {0x19, 0xAD, 0x8C, 0x65, 0xC7, 0x7E, 0x45, 0x3E, 0xDA, 0xF7, 0x36, 0xBF, 0x66, 0x3E, 0x32};
    return detail::Dec(v, sizeof(v), 0xD4D79823u);
}

SLX9_FORCE_INLINE std::string X039() {
    static const uint8_t v[] = {0xF8, 0x4B, 0x63, 0x61, 0xAA, 0x46, 0xC1, 0x6B, 0xBB, 0xC3, 0xC2, 0x8D, 0x6B, 0x26, 0xCE, 0x02, 0x1C, 0xBD, 0x45, 0x1C};
    return detail::Dec(v, sizeof(v), 0xA9AFB44Du);
}

SLX9_FORCE_INLINE std::string X040() {
    static const uint8_t v[] = {0x34, 0x6A, 0xBC, 0xB0, 0x77, 0x16, 0x17, 0xBE, 0x3C, 0x26, 0x34, 0xBD, 0x34, 0x15, 0x20, 0x68, 0x77, 0x3E};
    return detail::Dec(v, sizeof(v), 0x7BF7FBBFu);
}

SLX9_FORCE_INLINE std::string X041() {
    static const uint8_t v[] = {0x81, 0x9F, 0xE2, 0x18, 0x99, 0xCB, 0x57, 0x07, 0xC2, 0xF4, 0x60, 0x8A, 0x27, 0x38, 0x20, 0x9F, 0x72, 0x26, 0x27, 0x3A, 0x91, 0x79, 0x9A, 0x34, 0x0C, 0x68, 0x8F, 0x83, 0xE0, 0xF4, 0xF6, 0x44, 0xD6, 0x26, 0x7F};
    return detail::Dec(v, sizeof(v), 0x9339A6F3u);
}

SLX9_FORCE_INLINE std::string X042() {
    static const uint8_t v[] = {0xBD, 0x9C, 0x0B, 0x8C, 0xF4, 0x80, 0x31, 0x07, 0x09, 0xE2, 0x1A, 0xB6, 0x54, 0x4C, 0xD3, 0x5B, 0xCF, 0x1E, 0x71, 0xBD, 0x22, 0xB8, 0x8D, 0x13, 0x41, 0xC6, 0x6B, 0x5E, 0x82, 0x96, 0xC3, 0xE3};
    return detail::Dec(v, sizeof(v), 0xBDC08FD4u);
}

SLX9_FORCE_INLINE std::string X043() {
    static const uint8_t v[] = {0xD8, 0x11, 0x84, 0xFC, 0x14, 0x3A, 0x66, 0x18, 0xBB};
    return detail::Dec(v, sizeof(v), 0x684F463Bu);
}

SLX9_FORCE_INLINE std::string X044() {
    static const uint8_t v[] = {0xB9, 0xC2, 0x8E, 0x48, 0xED, 0x76, 0x42, 0xEB, 0xD4, 0x4C, 0x1F, 0x0A, 0x65, 0xE8, 0xD8, 0x54, 0xE7, 0x23, 0xBF, 0x15, 0xBC, 0x99, 0x49, 0x52, 0xD6, 0xC2, 0x64, 0xE2, 0xE6, 0xBF, 0xF6, 0xE6, 0xE2, 0xE1, 0x86, 0xEA, 0xE0, 0x10, 0x5F, 0x49, 0xAF, 0xA7, 0x67, 0x55, 0x34, 0x1F, 0x69, 0x74, 0xFE, 0x11, 0xFD, 0x0D, 0xAB, 0xE9, 0xAA, 0xD8, 0x63, 0xAA, 0x92, 0x98, 0xDF, 0xEA, 0xDF, 0xC3, 0x97, 0x5F, 0xF5, 0x6C, 0x93, 0x53, 0xF3};
    return detail::Dec(v, sizeof(v), 0x3EA396ADu);
}

SLX9_FORCE_INLINE std::string X045() {
    static const uint8_t v[] = {0xDE, 0xE7, 0xAE, 0xAF, 0x13, 0x5E, 0x11, 0x02, 0x38, 0x88};
    return detail::Dec(v, sizeof(v), 0xF10EFBCAu);
}

SLX9_FORCE_INLINE std::string X046() {
    static const uint8_t v[] = {0xC9, 0x9D, 0x21, 0x05, 0x61, 0xAF, 0x08, 0xF4, 0x42, 0xDC, 0x9B, 0xC2, 0x1E, 0x82, 0x73, 0x7A};
    return detail::Dec(v, sizeof(v), 0xABEDC13Bu);
}

SLX9_FORCE_INLINE std::string X047() {
    static const uint8_t v[] = {0x60, 0xAB, 0x34, 0x4A, 0x5C, 0xA8, 0xD7, 0x33, 0x55, 0xFD, 0xD7, 0x90, 0xFE, 0x18, 0xE4, 0x34, 0x78, 0x75, 0xCD, 0x68, 0x86, 0x36, 0x37, 0x94, 0x0B, 0xB2, 0x39, 0x15, 0xE0, 0x53, 0x57, 0x45, 0xF2, 0x09, 0x8E, 0x73, 0xE8, 0x51};
    return detail::Dec(v, sizeof(v), 0xAC3FDDE2u);
}

SLX9_FORCE_INLINE std::string X048() {
    static const uint8_t v[] = {0x8D, 0xBF, 0xA5, 0x15, 0x27, 0x2A, 0x5A, 0x38, 0xCE};
    return detail::Dec(v, sizeof(v), 0xF442CBEFu);
}

SLX9_FORCE_INLINE std::string X049() {
    static const uint8_t v[] = {0x64, 0x09, 0xE1, 0x96, 0xBE, 0x7B, 0x0B, 0x99, 0xEB, 0x01, 0xCF, 0x04, 0x37, 0xD3};
    return detail::Dec(v, sizeof(v), 0x124CF751u);
}

SLX9_FORCE_INLINE std::string X050() {
    static const uint8_t v[] = {0x63, 0xD4, 0x36};
    return detail::Dec(v, sizeof(v), 0xA89DC776u);
}

SLX9_FORCE_INLINE std::string X051() {
    static const uint8_t v[] = {0x2F, 0x8F, 0x57, 0x6B, 0x32, 0x10, 0xF5, 0x4F, 0xBB, 0xE9, 0x8B, 0x92, 0x76, 0xE7};
    return detail::Dec(v, sizeof(v), 0x11A2C1DFu);
}

SLX9_FORCE_INLINE std::string X052() {
    static const uint8_t v[] = {0x3F, 0x87, 0xEA, 0x1C, 0x0B, 0x0A, 0xA1, 0x18, 0x11, 0x64, 0x03, 0x8A, 0x8F, 0xF8, 0xA6, 0x71, 0x65, 0x07, 0x40, 0xF8, 0x01, 0x70, 0x06, 0xF5, 0x66, 0xBE, 0x7E, 0x22};
    return detail::Dec(v, sizeof(v), 0x8345086Cu);
}

SLX9_FORCE_INLINE std::string X053() {
    static const uint8_t v[] = {0xB7, 0x7A, 0xD6, 0x26, 0x9B, 0x5C, 0xF0, 0x8A, 0xF2};
    return detail::Dec(v, sizeof(v), 0xFCCA8C88u);
}

SLX9_FORCE_INLINE std::string X054() {
    static const uint8_t v[] = {0x81, 0x9B, 0x06, 0x0F, 0x12, 0x63, 0x8E, 0x9C, 0xBA, 0x59, 0x8D, 0x14, 0x08, 0x39, 0x45, 0xE9, 0x43, 0xE7, 0xE3, 0xAF, 0x4B, 0x1C, 0xDC, 0xA4, 0xE4, 0xF8, 0xFC, 0x04, 0x15, 0xD8, 0x1F, 0x5F, 0xFD, 0xE7};
    return detail::Dec(v, sizeof(v), 0xFD1B5235u);
}

SLX9_FORCE_INLINE std::string X055() {
    static const uint8_t v[] = {0x98, 0x85, 0x8D, 0x47, 0xC8, 0x2B, 0xC0, 0x02, 0xC4, 0x13, 0x36, 0x7B};
    return detail::Dec(v, sizeof(v), 0x61CB6CE2u);
}

SLX9_FORCE_INLINE std::string X056() {
    static const uint8_t v[] = {0x95, 0x8C, 0x1A, 0xFF, 0x9A, 0x33, 0x84, 0x31, 0x60, 0x4E, 0x1F, 0x26, 0x73, 0x9E, 0x21, 0x2C, 0x63, 0x86, 0x0D, 0x8D, 0x68, 0x63, 0xBF, 0x1E, 0xE4, 0x45, 0x81, 0xF8, 0xD3, 0x3D, 0x38, 0x2C, 0x48, 0xB2, 0x28, 0xD7, 0x13, 0x77, 0xFB, 0x7A, 0x99, 0xA8, 0x84, 0x13, 0x17, 0x8F, 0xA2, 0xAE, 0x59, 0xCE, 0x30};
    return detail::Dec(v, sizeof(v), 0x71B3FBE3u);
}

SLX9_FORCE_INLINE std::string X057() {
    static const uint8_t v[] = {0x72, 0xD3, 0x08, 0x82, 0xE6, 0x4C, 0x58};
    return detail::Dec(v, sizeof(v), 0x3039DAEDu);
}

SLX9_FORCE_INLINE std::string X058() {
    static const uint8_t v[] = {0x7D, 0x43, 0x7D, 0xCF, 0x82, 0xC8, 0xDB, 0xE6, 0x8E, 0xAF, 0xED, 0xF9, 0xF9, 0xF6, 0xB8, 0xFB, 0xB5, 0x77, 0x94, 0xC6, 0x17, 0xBE, 0x17, 0x1C, 0x4B, 0xD7};
    return detail::Dec(v, sizeof(v), 0x1BE63225u);
}

SLX9_FORCE_INLINE std::string X059() {
    static const uint8_t v[] = {0x80, 0x3C, 0x32, 0xFE, 0xB5, 0x3D, 0xD8, 0xC1};
    return detail::Dec(v, sizeof(v), 0x4885CE79u);
}

SLX9_FORCE_INLINE std::string X060() {
    static const uint8_t v[] = {0x02, 0x00, 0x99, 0x32, 0xAA, 0x7A, 0x29, 0xCF, 0x52, 0x85, 0xA5, 0xAB, 0x9A, 0x8F, 0xEE, 0x54, 0x26, 0x68, 0x1E, 0x1B, 0xAB, 0xAC};
    return detail::Dec(v, sizeof(v), 0x9F7C7977u);
}

SLX9_FORCE_INLINE std::string X061() {
    static const uint8_t v[] = {0xD1, 0x18, 0x52, 0x69, 0xDC, 0x57, 0x1A, 0xFF, 0xC0, 0x9D, 0xB4, 0x84, 0x79, 0x69, 0xFB};
    return detail::Dec(v, sizeof(v), 0x10CF51AEu);
}

SLX9_FORCE_INLINE std::string X062() {
    static const uint8_t v[] = {0x76, 0xC1, 0xA9, 0xC7, 0x57, 0x43, 0x82, 0xDB, 0xD9, 0x57, 0x08};
    return detail::Dec(v, sizeof(v), 0x3E590EDEu);
}

SLX9_FORCE_INLINE std::string X063() {
    static const uint8_t v[] = {0x1A, 0x42, 0xE6, 0x1E, 0xA3, 0xD3, 0x15, 0x99, 0x27, 0x6F, 0x4F, 0xE3, 0xE3, 0xD3, 0x84, 0xEC, 0xAF, 0xF2};
    return detail::Dec(v, sizeof(v), 0x1B73AA4Eu);
}

SLX9_FORCE_INLINE std::string X064() {
    static const uint8_t v[] = {0x00, 0x39, 0x7E, 0x78, 0xAB};
    return detail::Dec(v, sizeof(v), 0xA3CA45AEu);
}

SLX9_FORCE_INLINE std::string X065() {
    static const uint8_t v[] = {0x7A, 0x20, 0x14, 0xFE, 0x84, 0x30, 0x3B, 0xE5, 0xB2, 0x32, 0xB5, 0xE1, 0xD0, 0x0B, 0x2A, 0x51, 0xEF, 0xCC, 0x9C, 0xBB, 0x42, 0x01, 0xDC, 0x2B, 0xA8, 0x9C, 0xED, 0x48, 0x15, 0x55, 0x63, 0xD1, 0x56, 0x7D, 0x15, 0x9A, 0xDF};
    return detail::Dec(v, sizeof(v), 0x8C1D65D5u);
}

SLX9_FORCE_INLINE std::string X066() {
    static const uint8_t v[] = {0x87, 0x4D, 0x9C, 0x0E, 0xEB, 0x54};
    return detail::Dec(v, sizeof(v), 0xEED1B0FDu);
}

SLX9_FORCE_INLINE std::string X067() {
    static const uint8_t v[] = {0x55, 0xF2, 0xD1, 0xB5, 0x50, 0x24, 0x21, 0xEC, 0xEA, 0x19, 0x8B, 0xD6, 0x2A, 0x2C, 0x15, 0xC8, 0xC8, 0x2B, 0x9B, 0xBD, 0xDB, 0x35, 0xC9, 0xAE, 0x5B, 0xF5, 0xED, 0x13, 0x52, 0xF5, 0x77, 0xDE, 0x29, 0x6E, 0xE0, 0x94, 0xB3, 0xFC};
    return detail::Dec(v, sizeof(v), 0xCF33D93Du);
}

SLX9_FORCE_INLINE std::string X068() {
    static const uint8_t v[] = {0x1E, 0x7D, 0xCC, 0xC0, 0x30, 0xA5, 0xE0, 0x5D, 0x33, 0x21, 0x14, 0xE1, 0xA1};
    return detail::Dec(v, sizeof(v), 0xB000E054u);
}

SLX9_FORCE_INLINE std::string X069() {
    static const uint8_t v[] = {0x89, 0xAD, 0xC9, 0xE6, 0x7D, 0xF5, 0x66, 0x88, 0xD9, 0xA8, 0xA6, 0x4A, 0x90, 0x4E, 0x17, 0x47, 0xBD, 0xFD, 0x3B, 0x46, 0x3B, 0x7B, 0xA6, 0xE2, 0x47, 0xFD, 0xBE};
    return detail::Dec(v, sizeof(v), 0x70DB4B93u);
}

SLX9_FORCE_INLINE std::string X070() {
    static const uint8_t v[] = {0x5F, 0x89, 0xEB, 0x73, 0x87, 0xC6, 0xF7, 0x7B, 0x3E, 0x2B, 0x23, 0x4E, 0x53, 0x5B};
    return detail::Dec(v, sizeof(v), 0xFCE61735u);
}

SLX9_FORCE_INLINE std::string X071() {
    static const uint8_t v[] = {0x38, 0xDE, 0x41, 0xD4, 0xB2, 0x03, 0xFF, 0xB1, 0xEE};
    return detail::Dec(v, sizeof(v), 0x581374A6u);
}

SLX9_FORCE_INLINE std::string X072() {
    static const uint8_t v[] = {0x6F, 0x99, 0x89, 0xBB, 0x08, 0xE1, 0x03, 0xE1, 0xDE, 0xC4, 0xE4, 0xBF, 0x3D, 0x30, 0x06, 0xFD, 0xE3, 0xF1, 0x00, 0x0C, 0xFF, 0x84, 0x32, 0x97, 0x74, 0x3C, 0xB8, 0xC4, 0x7C, 0xA9, 0xF7, 0xF4, 0x13};
    return detail::Dec(v, sizeof(v), 0x7CFC339Bu);
}

SLX9_FORCE_INLINE std::string X073() {
    static const uint8_t v[] = {0x5E, 0x1D, 0x9C, 0xA9, 0xB1, 0x85, 0x1A, 0xE7, 0xF8, 0x65, 0x71, 0xC7, 0x0F, 0xC2, 0x36};
    return detail::Dec(v, sizeof(v), 0xB2D603A1u);
}

SLX9_FORCE_INLINE std::string X074() {
    static const uint8_t v[] = {0x33, 0xED, 0x0E, 0x48, 0xF0, 0xEA, 0x93, 0x59, 0xDE, 0x49, 0x69, 0xEA, 0x18, 0xED, 0x95, 0x37, 0xC9, 0x1D, 0xFA, 0x79, 0x99};
    return detail::Dec(v, sizeof(v), 0xD21051A8u);
}

SLX9_FORCE_INLINE std::string X075() {
    static const uint8_t v[] = {0x2B, 0xD5, 0x85, 0xB9, 0xDD, 0xEC, 0xFE, 0x4A, 0x0B, 0x08, 0x95, 0x5D, 0xB2, 0xE3, 0x6E, 0x96, 0x0D, 0x2E, 0x3D, 0x0D, 0x78, 0x72, 0xCA, 0xDE, 0x74, 0xA2, 0xF7, 0xE0};
    return detail::Dec(v, sizeof(v), 0x448AA125u);
}

SLX9_FORCE_INLINE std::string X076() {
    static const uint8_t v[] = {0xB1, 0xB6, 0x18, 0x63, 0x67, 0x03, 0xEB, 0xB9, 0x62, 0x83, 0x5B, 0x65, 0xC9, 0x48, 0xFF, 0xD8};
    return detail::Dec(v, sizeof(v), 0x5DF4B290u);
}

SLX9_FORCE_INLINE std::string X077() {
    static const uint8_t v[] = {0xE2, 0xCF, 0xC0, 0xA7, 0xAF, 0xAA, 0x10, 0xCB, 0xC0, 0x99, 0x77, 0x76, 0x18, 0xF9, 0xAF, 0xF4, 0xE8, 0x68, 0x53, 0x8E, 0x93, 0xCE, 0xA7, 0x97, 0x0C, 0x9B, 0xAA, 0xF8, 0x9F, 0x7F};
    return detail::Dec(v, sizeof(v), 0xF86F3DC9u);
}

SLX9_FORCE_INLINE std::string X078() {
    static const uint8_t v[] = {0x39, 0xC3, 0xE5, 0x0D, 0xC9, 0x58, 0xAC, 0x47, 0xED, 0xBF, 0x3F, 0xF8, 0xCA, 0xC4};
    return detail::Dec(v, sizeof(v), 0x885C7402u);
}

SLX9_FORCE_INLINE std::string X079() {
    static const uint8_t v[] = {0xDD, 0x5F, 0xB4, 0x22, 0x16, 0xA6, 0x0D, 0x95, 0x6A, 0x5C, 0x11, 0x2D, 0x22, 0x19, 0x77, 0x99, 0x8D, 0x8A, 0x32, 0x81, 0xD4, 0x48, 0x4F, 0xD1};
    return detail::Dec(v, sizeof(v), 0x33DCB970u);
}

SLX9_FORCE_INLINE std::string X080() {
    static const uint8_t v[] = {0x0F, 0xAC, 0xC8, 0x13, 0x31, 0xAF, 0xE4};
    return detail::Dec(v, sizeof(v), 0xFE9FC952u);
}

SLX9_FORCE_INLINE std::string X081() {
    static const uint8_t v[] = {0x82, 0x52};
    return detail::Dec(v, sizeof(v), 0x43E8EDB6u);
}

SLX9_FORCE_INLINE std::string X082() {
    static const uint8_t v[] = {0xDC, 0xCA};
    return detail::Dec(v, sizeof(v), 0xB32F1F9Cu);
}

SLX9_FORCE_INLINE std::string X083() {
    static const uint8_t v[] = {0x55, 0x4C};
    return detail::Dec(v, sizeof(v), 0xDB08D71Au);
}

SLX9_FORCE_INLINE std::string X084() {
    static const uint8_t v[] = {0xB3, 0xED, 0xB5, 0x26, 0xA0};
    return detail::Dec(v, sizeof(v), 0xD60BBC5Au);
}

SLX9_FORCE_INLINE std::string X085() {
    static const uint8_t v[] = {0xBD, 0x76, 0x5B, 0xD0, 0x32};
    return detail::Dec(v, sizeof(v), 0xED47FCA6u);
}

SLX9_FORCE_INLINE std::string X086() {
    static const uint8_t v[] = {0x3D, 0x4F, 0x2E, 0xAF, 0xB0};
    return detail::Dec(v, sizeof(v), 0xD00DF15Bu);
}

SLX9_FORCE_INLINE std::string X087() {
    static const uint8_t v[] = {0x80, 0x2C, 0xC5, 0x55, 0x34, 0xDE, 0x5D, 0x1C, 0x38, 0x12, 0xAF, 0x32};
    return detail::Dec(v, sizeof(v), 0x4CF75C1Fu);
}

SLX9_FORCE_INLINE std::string X088() {
    static const uint8_t v[] = {};
    return detail::Dec(v, sizeof(v), 0x3830DD78u);
}

SLX9_FORCE_INLINE std::string X089() {
    static const uint8_t v[] = {0x70, 0x50, 0xED, 0xCC};
    return detail::Dec(v, sizeof(v), 0x90A53EBDu);
}

SLX9_FORCE_INLINE std::string X090() {
    static const uint8_t v[] = {0x55, 0x60, 0x9B, 0xC1, 0xEE};
    return detail::Dec(v, sizeof(v), 0x09A3D321u);
}

SLX9_FORCE_INLINE std::string X091() {
    static const uint8_t v[] = {0x0C, 0x6D, 0xB2, 0x59};
    return detail::Dec(v, sizeof(v), 0xC941861Eu);
}

SLX9_FORCE_INLINE std::string X092() {
    static const uint8_t v[] = {0x1D, 0x8F};
    return detail::Dec(v, sizeof(v), 0x25B0041Cu);
}

SLX9_FORCE_INLINE std::string X093() {
    static const uint8_t v[] = {0x87, 0x7A, 0xA4, 0x8F, 0x00, 0xE2, 0xF0, 0x51, 0xCE, 0x92, 0xA4, 0xE3, 0xD5, 0xE5, 0x0E, 0xB7, 0x13, 0x94, 0xD0, 0x87, 0xB1, 0x1D, 0x4C, 0x9A};
    return detail::Dec(v, sizeof(v), 0xAA2BA110u);
}

SLX9_FORCE_INLINE std::string X094() {
    static const uint8_t v[] = {0xEC, 0x3E, 0xDF};
    return detail::Dec(v, sizeof(v), 0x365CB8A7u);
}

SLX9_FORCE_INLINE std::string X095() {
    static const uint8_t v[] = {0x66, 0x71, 0x6F, 0xF5, 0x81, 0xC1, 0x5A, 0x9A, 0xE1, 0x07};
    return detail::Dec(v, sizeof(v), 0xC64F98E0u);
}

SLX9_FORCE_INLINE std::string X096() {
    static const uint8_t v[] = {0x40, 0xE6, 0xE5, 0x58, 0x5F, 0xBA, 0xE7, 0x76, 0x6C, 0x4F, 0xBF};
    return detail::Dec(v, sizeof(v), 0x3903BE55u);
}

SLX9_FORCE_INLINE std::string X097() {
    static const uint8_t v[] = {0xCA, 0xAC, 0x0C, 0x1A, 0x0F, 0xA5, 0x35, 0xFF, 0x84, 0x75, 0x62};
    return detail::Dec(v, sizeof(v), 0x32226974u);
}

SLX9_FORCE_INLINE std::string X098() {
    static const uint8_t v[] = {0x6C, 0xFC, 0xFD, 0xB9, 0xB0, 0x2B, 0x63};
    return detail::Dec(v, sizeof(v), 0x5827379Bu);
}

SLX9_FORCE_INLINE std::string X099() {
    static const uint8_t v[] = {0xCC, 0x68, 0x85, 0xD4, 0xB9, 0x22, 0x27, 0xC6, 0xAE, 0xA9, 0x8D, 0x8D, 0xBE, 0x18, 0x71, 0x81, 0x33};
    return detail::Dec(v, sizeof(v), 0x1309D436u);
}

SLX9_FORCE_INLINE std::string X100() {
    static const uint8_t v[] = {0x8D, 0x79, 0x93, 0xEE, 0xA9, 0x99, 0xD4, 0x48, 0x6A, 0xF2, 0x6F, 0xD4, 0x5C, 0xA2, 0x75};
    return detail::Dec(v, sizeof(v), 0x06A798C1u);
}

SLX9_FORCE_INLINE std::string X101() {
    static const uint8_t v[] = {0x0D, 0x21, 0xF4};
    return detail::Dec(v, sizeof(v), 0x4F48CE77u);
}

SLX9_FORCE_INLINE std::string X102() {
    static const uint8_t v[] = {0xAF, 0xA3, 0xD9, 0xBB, 0x0D, 0x90, 0x26, 0xCC, 0x23};
    return detail::Dec(v, sizeof(v), 0x1C13F458u);
}

SLX9_FORCE_INLINE std::string X103() {
    static const uint8_t v[] = {0xFF, 0xD5, 0xB1, 0x52, 0x6C, 0x7C, 0x9C, 0x01, 0x5C, 0x96, 0xC3, 0xA3, 0xF5, 0x0B, 0xBA, 0x2D, 0xAE, 0x80, 0xAC, 0x9D, 0x4B, 0xC3, 0x61, 0xFC, 0x91, 0xBD, 0x0B, 0xEC, 0x9E, 0xBF, 0xFC, 0x98, 0x50, 0x3D, 0xB9, 0xE7, 0x53, 0xB2, 0x07, 0xB2, 0x7C, 0x56, 0x49, 0xA9, 0xEC, 0x08};
    return detail::Dec(v, sizeof(v), 0x632E1F7Du);
}

SLX9_FORCE_INLINE std::string X104() {
    static const uint8_t v[] = {0x7A, 0xF7, 0x9D, 0xFC, 0x1D, 0xA4, 0x34, 0xEB, 0x25, 0x57, 0x4B, 0xC8, 0x0E, 0x44, 0x42, 0xC4, 0x61, 0xDC, 0x4A, 0x58, 0x8B, 0x1C, 0x2F, 0x5D, 0xF5, 0xD1, 0x70, 0x18, 0x4C, 0xBE, 0xC2, 0x0E, 0x47, 0x16, 0xDF, 0xEF, 0xD8, 0x41, 0x60, 0xBC, 0x1A, 0x5D, 0xB5};
    return detail::Dec(v, sizeof(v), 0x38526269u);
}

SLX9_FORCE_INLINE std::string X105() {
    static const uint8_t v[] = {0x01, 0xEF, 0x7D, 0x13, 0x9E, 0x23, 0x37, 0xA2, 0x72, 0xCF};
    return detail::Dec(v, sizeof(v), 0x7C7B0B64u);
}

SLX9_FORCE_INLINE std::string X106() {
    static const uint8_t v[] = {0xF8, 0x20};
    return detail::Dec(v, sizeof(v), 0x2EBA6E51u);
}

SLX9_FORCE_INLINE std::string X107() {
    static const uint8_t v[] = {0xD5, 0x95, 0x6B, 0x35, 0x64, 0xEA, 0x7E, 0xBE, 0x4E, 0x4B, 0xA0, 0x7D, 0xAB, 0x6D, 0x15, 0x6B, 0x07, 0xA0, 0x06, 0x63, 0xD5, 0x69, 0x32};
    return detail::Dec(v, sizeof(v), 0x98A2BDB3u);
}

SLX9_FORCE_INLINE std::string X108() {
    static const uint8_t v[] = {0x12, 0x7A, 0xB4, 0x39, 0x9D, 0xF3, 0x13, 0x3B, 0x38, 0xBD, 0x73, 0xD6, 0x65, 0xDC, 0xD3, 0x59, 0xD6, 0xAB, 0xEE, 0x8D, 0xCD, 0x78, 0x96, 0xD5, 0x54, 0x5F, 0xBC, 0xFD, 0xAD, 0x87, 0xC4, 0xE3, 0xE6, 0xB2, 0x5E};
    return detail::Dec(v, sizeof(v), 0x11706944u);
}

SLX9_FORCE_INLINE std::string X109() {
    static const uint8_t v[] = {0xA6, 0x9D, 0x47, 0xEB, 0x3E, 0x46, 0xA4, 0x48, 0x06, 0xC9, 0x46, 0x5E, 0xA6, 0x01, 0xBF, 0x10, 0x28, 0x3E, 0x72, 0xBA, 0xAB, 0x65, 0x1E, 0x2E, 0x07, 0xC3, 0xA9, 0x9C};
    return detail::Dec(v, sizeof(v), 0x0CD2E403u);
}

SLX9_FORCE_INLINE std::string X110() {
    static const uint8_t v[] = {0x88, 0x6A, 0x85, 0x6E, 0xEB, 0x61, 0xCC, 0x0F, 0xE5, 0xB6, 0x8E, 0x9E, 0x44, 0x64, 0xAB, 0x06, 0xA1, 0x4C};
    return detail::Dec(v, sizeof(v), 0x562BB9B2u);
}

SLX9_FORCE_INLINE std::string X111() {
    static const uint8_t v[] = {0x0D, 0x6A, 0xCB, 0xED, 0x9F, 0xEE, 0x62, 0x53, 0xAF, 0x95, 0xBB, 0x6E, 0x11, 0xCE, 0xF1, 0x79, 0x02, 0x31, 0x86, 0xC2, 0x79, 0x93, 0xD0, 0x94, 0xC4, 0x61, 0x00};
    return detail::Dec(v, sizeof(v), 0x57DBBA7Du);
}

SLX9_FORCE_INLINE std::string X112() {
    static const uint8_t v[] = {0xC1, 0x8A, 0x6E, 0x83, 0x3A, 0xD7, 0xBA, 0xAF, 0x68, 0xAF, 0xF3, 0x3A, 0xC6, 0xC9, 0x7B, 0x94, 0x6F, 0xE1, 0xBB, 0xFB, 0x7F, 0x64, 0x4F, 0x76, 0x08, 0xB9};
    return detail::Dec(v, sizeof(v), 0xC3897CA3u);
}

SLX9_FORCE_INLINE std::string X113() {
    static const uint8_t v[] = {0x4B, 0x0E, 0x36, 0x99, 0x42, 0xC6, 0xB8, 0x01, 0x83, 0x39, 0x00, 0x78, 0xF3, 0x0E, 0xFA, 0x07};
    return detail::Dec(v, sizeof(v), 0x540FC725u);
}

SLX9_FORCE_INLINE std::string X114() {
    static const uint8_t v[] = {0xC3, 0xD8, 0xAE, 0xB8, 0x11, 0xCD, 0xEE, 0xE5};
    return detail::Dec(v, sizeof(v), 0x1274E37Au);
}

SLX9_FORCE_INLINE std::string X115() {
    static const uint8_t v[] = {0x1F, 0x65, 0xB1, 0xB9, 0xC9, 0xBC, 0x41, 0xFA, 0x67, 0xBE, 0xF3, 0x87};
    return detail::Dec(v, sizeof(v), 0x59852C08u);
}

SLX9_FORCE_INLINE std::string X116() {
    static const uint8_t v[] = {0x3C, 0x7C, 0x5E, 0x01, 0xFE, 0xF2, 0x39, 0x82, 0x3B, 0x7D, 0xA2, 0x42, 0x57, 0x79, 0xC7, 0xE7, 0x32};
    return detail::Dec(v, sizeof(v), 0xA8BE6C9Fu);
}

SLX9_FORCE_INLINE std::string X117() {
    static const uint8_t v[] = {0xD6, 0x79};
    return detail::Dec(v, sizeof(v), 0x0B6B5228u);
}

SLX9_FORCE_INLINE std::string X118() {
    static const uint8_t v[] = {0x4D, 0x44, 0x9B, 0x52, 0xF5, 0x58, 0xD0, 0x43, 0x92, 0x85, 0x85, 0xFC, 0x27, 0xF3, 0x8A, 0x8F, 0x5F, 0x17, 0x91, 0x8A, 0xD2, 0x91, 0xE9, 0x4D, 0x6C, 0x92, 0x77, 0x4A, 0x81, 0x29};
    return detail::Dec(v, sizeof(v), 0xC98DDDB2u);
}

SLX9_FORCE_INLINE std::string X119() {
    static const uint8_t v[] = {0x9D, 0x2F, 0xD4, 0x9F, 0x78, 0x41, 0xA3, 0x8A, 0xCD, 0x81, 0x1D, 0x37, 0x9E, 0x0C, 0x3D, 0x5E, 0x82, 0xEA, 0xE4, 0x9E, 0x4D, 0x66, 0x55, 0xB1};
    return detail::Dec(v, sizeof(v), 0x6C4532FDu);
}

SLX9_FORCE_INLINE std::string X120() {
    static const uint8_t v[] = {0x20, 0x0A, 0x6E, 0x29, 0xAD, 0x00};
    return detail::Dec(v, sizeof(v), 0x09E3A667u);
}

SLX9_FORCE_INLINE std::string X121() {
    static const uint8_t v[] = {0x05, 0xD6, 0xAB, 0x1C, 0xEF, 0xB7, 0xB2, 0x01, 0x11};
    return detail::Dec(v, sizeof(v), 0xAEE7B8AFu);
}

SLX9_FORCE_INLINE std::string X122() {
    static const uint8_t v[] = {0x34, 0xE7, 0x1C, 0xAE, 0x6B, 0x79, 0x25};
    return detail::Dec(v, sizeof(v), 0xF76BA3BFu);
}

SLX9_FORCE_INLINE std::string X123() {
    static const uint8_t v[] = {0xCE, 0x99, 0xAD, 0xAB, 0xFB, 0x59, 0xF9, 0x85, 0x57, 0x49, 0x8E, 0x4F};
    return detail::Dec(v, sizeof(v), 0x2A204660u);
}

SLX9_FORCE_INLINE std::string X124() {
    static const uint8_t v[] = {0x4C, 0x35, 0x1B, 0x8B, 0x93, 0xCB, 0x0B, 0x85, 0xAD};
    return detail::Dec(v, sizeof(v), 0x0377F4E2u);
}

SLX9_FORCE_INLINE std::string X125() {
    static const uint8_t v[] = {0x1F, 0x6C, 0xE7, 0xE1, 0x1B, 0xDC, 0x80, 0xFB, 0xE4, 0xAD, 0xAA, 0x86, 0x7E, 0x44, 0x49, 0x09, 0x66, 0x9A, 0x1A, 0xB9, 0x33};
    return detail::Dec(v, sizeof(v), 0xB78D3C67u);
}

SLX9_FORCE_INLINE std::string X126() {
    static const uint8_t v[] = {0xF5};
    return detail::Dec(v, sizeof(v), 0x1C3CE216u);
}

SLX9_FORCE_INLINE std::string X127() {
    static const uint8_t v[] = {0x8C, 0x28, 0x7E, 0xAB, 0x13, 0x60, 0x8E, 0x3D, 0x41, 0x6A, 0xC1, 0x15, 0xCA, 0xFC};
    return detail::Dec(v, sizeof(v), 0x0996EDD7u);
}

SLX9_FORCE_INLINE std::string X128() {
    static const uint8_t v[] = {0x36, 0x16, 0x33, 0xCC, 0x9C};
    return detail::Dec(v, sizeof(v), 0xB7A994C3u);
}

SLX9_FORCE_INLINE std::string X129() {
    static const uint8_t v[] = {0x15, 0x29, 0xCB, 0x57, 0x8F, 0x6D, 0x15, 0xCC, 0x66, 0x19, 0x91, 0xBF, 0xF5, 0x98, 0xB1, 0x91, 0x40, 0xB9};
    return detail::Dec(v, sizeof(v), 0xB04CF17Du);
}

SLX9_FORCE_INLINE std::string X130() {
    static const uint8_t v[] = {0x89, 0x19, 0x64, 0xE0, 0x15, 0xB0, 0x74, 0xBA, 0xD6, 0x3F, 0x09, 0x8C, 0xC6, 0xC2, 0xAC};
    return detail::Dec(v, sizeof(v), 0x055648A6u);
}

SLX9_FORCE_INLINE std::string X131() {
    static const uint8_t v[] = {0x02, 0x16, 0xA2, 0x48, 0x20, 0x3E, 0xD1, 0x16, 0x71, 0x81, 0x8E};
    return detail::Dec(v, sizeof(v), 0xB15436F3u);
}

SLX9_FORCE_INLINE std::string X132() {
    static const uint8_t v[] = {0x48, 0x5A, 0xEA, 0x7F, 0x36, 0x8E, 0x98, 0x37, 0x39, 0x3A, 0x9D, 0xC6, 0xC2, 0x17, 0xCB, 0x9A, 0x74, 0x39, 0x66, 0x09, 0x75, 0xA9};
    return detail::Dec(v, sizeof(v), 0x415D541Cu);
}

SLX9_FORCE_INLINE std::string X133() {
    static const uint8_t v[] = {0x10, 0xA7, 0x4D, 0x41, 0x87, 0x82, 0x6B, 0x1E, 0xE4, 0x46, 0xC3, 0x47, 0x22};
    return detail::Dec(v, sizeof(v), 0x80EAB52Cu);
}

SLX9_FORCE_INLINE std::string X134() {
    static const uint8_t v[] = {0x7E, 0x9F, 0x7D, 0x44, 0x79, 0x7F, 0x64, 0x25, 0xC1, 0x40, 0x71, 0x91, 0xAD, 0x1F, 0xBB, 0xAE, 0x7F, 0xFC, 0xDE, 0x23, 0x02, 0x7E, 0x3C, 0xEA, 0xF9, 0x64};
    return detail::Dec(v, sizeof(v), 0x1799B1ACu);
}

SLX9_FORCE_INLINE std::string X135() {
    static const uint8_t v[] = {0x13, 0x76, 0xCA, 0x33, 0xE6, 0x4C, 0x46, 0xFB, 0x96, 0xB0, 0xB0, 0x3D, 0x4D, 0x56, 0x4F, 0x9C, 0xCA, 0x58, 0x69, 0x03, 0x21, 0xC2, 0x2A, 0x39, 0xFE, 0x45, 0x21, 0xF3};
    return detail::Dec(v, sizeof(v), 0x394E7ED0u);
}

SLX9_FORCE_INLINE std::string X136() {
    static const uint8_t v[] = {0xDD, 0x3F, 0x46, 0x53, 0xD1, 0xF0, 0xE6, 0xFB, 0x1D, 0xBE, 0x8D, 0xD8};
    return detail::Dec(v, sizeof(v), 0x05D194B7u);
}

SLX9_FORCE_INLINE std::string X137() {
    static const uint8_t v[] = {0x6F, 0xB2, 0x87, 0x00, 0xAE, 0x4E, 0x96, 0x4F, 0x2E, 0x67, 0x34, 0x6E, 0x6B, 0x65, 0x8B, 0x9B, 0x29, 0xBB, 0xF4, 0xA1, 0x1B, 0xCE, 0x39, 0x67, 0xB1, 0xC9, 0x49, 0xC3, 0x3F, 0xBA, 0xE4, 0xE7, 0x40, 0x46, 0x34, 0x18, 0x4C, 0xD4, 0xC4, 0xC9, 0x91, 0x39, 0x76, 0x09, 0xB2, 0x5D, 0x1A, 0x42, 0x07, 0xEB, 0x53, 0xDB, 0x63, 0x79, 0x68, 0xFB, 0xF7, 0x43, 0x33, 0xF9, 0x91, 0xB4, 0x6B, 0x79, 0xD9, 0x20, 0x15, 0x41};
    return detail::Dec(v, sizeof(v), 0x89B9461Du);
}

SLX9_FORCE_INLINE std::string X138() {
    static const uint8_t v[] = {0xA1, 0x7C, 0x39, 0x9B, 0xA7, 0xC7};
    return detail::Dec(v, sizeof(v), 0xAC21F973u);
}

SLX9_FORCE_INLINE std::string X139() {
    static const uint8_t v[] = {0x11, 0x93, 0xF7, 0x4D, 0x56, 0x7C, 0x76};
    return detail::Dec(v, sizeof(v), 0x61A5014Fu);
}

SLX9_FORCE_INLINE std::string X140() {
    static const uint8_t v[] = {0x17, 0x1B, 0x9E, 0x6F, 0x28, 0x8D, 0x59};
    return detail::Dec(v, sizeof(v), 0x1541CE44u);
}

SLX9_FORCE_INLINE std::string X141() {
    static const uint8_t v[] = {0x71, 0x7C, 0xCD, 0x8D, 0x76, 0x7F, 0x86, 0x48, 0x18, 0xEF};
    return detail::Dec(v, sizeof(v), 0x9BBAC1E8u);
}

SLX9_FORCE_INLINE std::string X142() {
    static const uint8_t v[] = {0xB6, 0x76, 0xC0, 0xC7, 0xA7, 0x3F, 0x5B, 0x03};
    return detail::Dec(v, sizeof(v), 0x30A3733Au);
}

SLX9_FORCE_INLINE std::string X143() {
    static const uint8_t v[] = {0x2D, 0xE7, 0x1C, 0x34, 0x5C, 0x8C, 0x40, 0x28};
    return detail::Dec(v, sizeof(v), 0x3A3A5CCCu);
}

SLX9_FORCE_INLINE std::string X144() {
    static const uint8_t v[] = {0xA0, 0xC3, 0xD8, 0x6E, 0x0F, 0x75, 0xC7};
    return detail::Dec(v, sizeof(v), 0xA7B872C8u);
}

SLX9_FORCE_INLINE std::string X145() {
    static const uint8_t v[] = {0x0C, 0x8B, 0x3E, 0x3B, 0x33, 0x08, 0xA0, 0xE6, 0x23, 0x77, 0x84, 0x40, 0xA3, 0x98, 0xC4, 0x13, 0x90, 0x13, 0x61, 0xFF};
    return detail::Dec(v, sizeof(v), 0xE586F477u);
}

SLX9_FORCE_INLINE std::string X146() {
    static const uint8_t v[] = {0xBF, 0x29, 0xD5, 0x69, 0x1D, 0xBF, 0xB5};
    return detail::Dec(v, sizeof(v), 0xA92FFF6Du);
}

SLX9_FORCE_INLINE std::string X147() {
    static const uint8_t v[] = {0xF8, 0xCE, 0xCD, 0xDA, 0x4E, 0x82, 0x7F, 0xBB, 0x02};
    return detail::Dec(v, sizeof(v), 0xD12C1D01u);
}

SLX9_FORCE_INLINE std::string X148() {
    static const uint8_t v[] = {0x9B, 0xE3, 0xBC, 0xE9, 0x19, 0x93, 0x07, 0x16, 0xD2, 0x3B, 0x40, 0x41, 0x0F};
    return detail::Dec(v, sizeof(v), 0x2DB40A73u);
}

SLX9_FORCE_INLINE std::string X149() {
    static const uint8_t v[] = {0xF5, 0xF6, 0xE4, 0xD6, 0x8F, 0x41, 0xE6, 0x7A, 0xC9, 0x43, 0xFF};
    return detail::Dec(v, sizeof(v), 0x43F5FB78u);
}

SLX9_FORCE_INLINE std::string X150() {
    static const uint8_t v[] = {0x33, 0x96, 0x72, 0x42, 0xA6, 0xFF, 0xB6, 0x12};
    return detail::Dec(v, sizeof(v), 0x1C0009ECu);
}

SLX9_FORCE_INLINE std::string X151() {
    static const uint8_t v[] = {0x38, 0xD4, 0x6B, 0x5B, 0x77, 0xCB, 0x4E, 0x8B, 0x87, 0xFB, 0x69, 0x28, 0x97, 0x31, 0xBD, 0x9B, 0x13, 0x9C, 0xA3};
    return detail::Dec(v, sizeof(v), 0xB1424C05u);
}

SLX9_FORCE_INLINE std::string X152() {
    static const uint8_t v[] = {0xF8, 0x28, 0x6D, 0xE3, 0x1D, 0xFD, 0xB1, 0x34, 0x93, 0xB0};
    return detail::Dec(v, sizeof(v), 0x2463ABB8u);
}

SLX9_FORCE_INLINE std::string X153() {
    static const uint8_t v[] = {0xD6, 0x25, 0x87};
    return detail::Dec(v, sizeof(v), 0xF82F0BE3u);
}

SLX9_FORCE_INLINE std::string X154() {
    static const uint8_t v[] = {0x62, 0x28, 0x5C, 0x42, 0xBF, 0x8A, 0x0E, 0x00, 0x07, 0xF0, 0x3D, 0x0B, 0x09, 0xBA, 0x8F, 0xCA, 0xD3, 0x02, 0x03, 0x08};
    return detail::Dec(v, sizeof(v), 0xD0EB860Au);
}

SLX9_FORCE_INLINE std::string X155() {
    static const uint8_t v[] = {0xC2, 0x53, 0xA1, 0x23, 0xF9};
    return detail::Dec(v, sizeof(v), 0xF5E3E1C9u);
}

SLX9_FORCE_INLINE std::string X156() {
    static const uint8_t v[] = {0xB3, 0xB7, 0x07, 0x44, 0xB8, 0xFC, 0x4B, 0x99, 0x7B, 0xF0, 0xE7, 0xBC, 0xF6};
    return detail::Dec(v, sizeof(v), 0x435D292Bu);
}

SLX9_FORCE_INLINE std::string X157() {
    static const uint8_t v[] = {0x6E, 0x2F, 0x2B, 0x67, 0x7B, 0x5C, 0x03, 0x59, 0x50, 0xDE, 0x23, 0xF2, 0x79, 0x77, 0x22, 0xB3, 0x5B, 0x49, 0xD7, 0x14, 0x15, 0x66, 0x4A, 0x5A, 0xB9, 0xCE, 0xCF, 0x47, 0x17, 0xCA, 0x66, 0x3C, 0x92, 0x12, 0xCE, 0x70, 0x2B, 0xF4, 0x97, 0xAC, 0xB4, 0x91, 0xC1, 0x23, 0x8D, 0x36, 0x1D, 0xB1, 0xAC, 0x82, 0x86};
    return detail::Dec(v, sizeof(v), 0x607C0FBBu);
}

SLX9_FORCE_INLINE std::string X158() {
    static const uint8_t v[] = {0x0C, 0x3F, 0x94, 0xBC, 0xA3};
    return detail::Dec(v, sizeof(v), 0x0E9918FCu);
}

SLX9_FORCE_INLINE std::string X159() {
    static const uint8_t v[] = {0x03, 0x6A, 0x66, 0xC0, 0xF9, 0x28, 0x88, 0xF6, 0x9C, 0xB9, 0x61, 0x15, 0x92};
    return detail::Dec(v, sizeof(v), 0x3F8E40B6u);
}

SLX9_FORCE_INLINE std::string X160() {
    static const uint8_t v[] = {0x4D, 0x70, 0xF8, 0x9A, 0x14, 0x1B, 0xA2, 0x0E, 0x0F, 0x8C};
    return detail::Dec(v, sizeof(v), 0x1112CA38u);
}

SLX9_FORCE_INLINE std::string X161() {
    static const uint8_t v[] = {0x60, 0x83, 0x62, 0x4B, 0xF0, 0x8A, 0xE5, 0xCC, 0xE9, 0x9D, 0x06};
    return detail::Dec(v, sizeof(v), 0xE241573Bu);
}

SLX9_FORCE_INLINE std::string X162() {
    static const uint8_t v[] = {0xAE, 0x91, 0x68, 0x9A, 0xE0, 0x36, 0x08, 0x4E, 0x1B};
    return detail::Dec(v, sizeof(v), 0xCC97F1A4u);
}

SLX9_FORCE_INLINE std::string X163() {
    static const uint8_t v[] = {0x38, 0xD0, 0xA7, 0x5F, 0xF7, 0x83, 0x58, 0x34, 0xD1, 0x8D, 0xD2, 0xBA, 0x63, 0xF4, 0x81, 0xF4, 0x66, 0x80, 0xEF};
    return detail::Dec(v, sizeof(v), 0x66D711DCu);
}

SLX9_FORCE_INLINE std::string X164() {
    static const uint8_t v[] = {0x55, 0x2C, 0xA6, 0x22, 0x32, 0x17, 0x3C, 0x6B, 0xEA, 0xD3, 0x6A, 0xAF, 0x73, 0x19, 0x46, 0xD2, 0x33, 0x3B, 0x50};
    return detail::Dec(v, sizeof(v), 0x5BFCB5CBu);
}

SLX9_FORCE_INLINE std::string X165() {
    static const uint8_t v[] = {0x66, 0xF7, 0xBA, 0x64, 0x1C, 0x8A, 0xBF, 0xB8};
    return detail::Dec(v, sizeof(v), 0x64A5AB88u);
}

SLX9_FORCE_INLINE std::string X166() {
    static const uint8_t v[] = {0x33, 0xD8, 0x4B, 0xAD, 0x84, 0xA4, 0x2E, 0x65, 0x57, 0x47, 0xF9};
    return detail::Dec(v, sizeof(v), 0x761A99FAu);
}

SLX9_FORCE_INLINE std::string X167() {
    static const uint8_t v[] = {0x3F, 0x80, 0xF5, 0xE1, 0x6E, 0xE7, 0x55, 0x8E, 0xD4, 0x09, 0x75, 0xA4, 0x07, 0x1A, 0xAD, 0x48, 0x40, 0x1B, 0xC5, 0x17, 0x1D, 0x6A, 0xBB, 0x0F, 0x79, 0xE1, 0x41, 0x83, 0x72};
    return detail::Dec(v, sizeof(v), 0x5AA418E2u);
}

SLX9_FORCE_INLINE std::string X168() {
    static const uint8_t v[] = {0xEA, 0xA5, 0xC6, 0xB8, 0x67, 0x5E, 0x36, 0xBA, 0x8D, 0xFA, 0xB4, 0x7C, 0xA8, 0xD9, 0x89, 0x30, 0x9C, 0xEF, 0xBB, 0x9C, 0xD4, 0x02, 0x77, 0xA9, 0x5F, 0xEB, 0x61, 0x38, 0x29};
    return detail::Dec(v, sizeof(v), 0x38645946u);
}

SLX9_FORCE_INLINE std::string X169() {
    static const uint8_t v[] = {0xE3, 0xCF, 0x67, 0x7A, 0xF7, 0x1F, 0x00, 0x45, 0x44, 0x25, 0x3B, 0x3B, 0x14, 0xB0, 0x41, 0xD8, 0xE1, 0xE7};
    return detail::Dec(v, sizeof(v), 0xB61AD4BEu);
}

SLX9_FORCE_INLINE std::string X170() {
    static const uint8_t v[] = {0xFA, 0x79, 0x2C, 0x7B, 0xDD, 0xD9, 0x21, 0xBD, 0x72, 0x78};
    return detail::Dec(v, sizeof(v), 0x634E83B2u);
}

SLX9_FORCE_INLINE std::string X171() {
    static const uint8_t v[] = {0x6D, 0xC6, 0x0E, 0x58, 0xF0, 0xCA, 0xE8, 0xC1, 0xFF, 0xA1, 0xA0, 0x07, 0x06, 0x58, 0xA7, 0xA5, 0x94, 0x9C, 0xB7, 0x6A, 0xB6};
    return detail::Dec(v, sizeof(v), 0x2C1BAD40u);
}

SLX9_FORCE_INLINE std::string X172() {
    static const uint8_t v[] = {0x38, 0xF9, 0xD9, 0xAF, 0xE5, 0xAA, 0x26, 0x28, 0xED, 0xB5, 0x78, 0xAD, 0x51, 0x73, 0x3A, 0x58, 0x8A, 0xB4, 0x49, 0xB6, 0xB9, 0x9B, 0x67, 0xF6, 0xD0, 0x6F, 0xD4, 0x61, 0xF3};
    return detail::Dec(v, sizeof(v), 0x81CAEF5Eu);
}

SLX9_FORCE_INLINE std::string X173() {
    static const uint8_t v[] = {0x73, 0xB7, 0x45, 0xF1, 0x18, 0x73, 0x35, 0x1E, 0x55, 0x55, 0x3C, 0x0C, 0xEB, 0x50, 0x47, 0xC4, 0x52, 0x64, 0x54, 0x37, 0x94, 0xC9, 0x47, 0x80, 0xF5, 0xC9, 0x6C, 0xC4, 0xEC, 0xAB, 0x45, 0x6B, 0x1C, 0x2F, 0x53, 0x3D, 0xE6, 0x3E};
    return detail::Dec(v, sizeof(v), 0x904882F3u);
}

SLX9_FORCE_INLINE std::string X174() {
    static const uint8_t v[] = {0xD7, 0xB9, 0x20, 0x81, 0x0B, 0x15, 0xF7, 0x3A, 0xC9, 0x61, 0xA1, 0x0D, 0x33, 0x6B, 0xD9, 0xD8, 0x43, 0x3F, 0x03, 0x3F, 0x79, 0xB6, 0xBA, 0x86, 0x0F, 0x56, 0xB0, 0xD2, 0x6E, 0xB0, 0xE8, 0x8A, 0x6F};
    return detail::Dec(v, sizeof(v), 0xC96932E1u);
}

SLX9_FORCE_INLINE std::string X175() {
    static const uint8_t v[] = {0xCA, 0xD9, 0x7A, 0xC8, 0xB8, 0xC3, 0x29, 0x0F, 0x77, 0xA7, 0x4F, 0x8B, 0x2F, 0x3B, 0xFA, 0x44, 0xB6, 0x2D, 0x3A, 0x12, 0x8C, 0x5C, 0xB4, 0xC2, 0x49, 0xEA, 0x21, 0x37};
    return detail::Dec(v, sizeof(v), 0xA0ABC6ECu);
}

SLX9_FORCE_INLINE std::string X176() {
    static const uint8_t v[] = {0x69, 0x24, 0x24, 0x89, 0x10, 0xAB, 0x30, 0xAB, 0xC7, 0xB4, 0x5D, 0xA8, 0xC5, 0xEA, 0x17, 0xEC, 0x17, 0x3E, 0xFB};
    return detail::Dec(v, sizeof(v), 0xA4FA40F8u);
}

SLX9_FORCE_INLINE std::string X177() {
    static const uint8_t v[] = {0x2A, 0x69, 0xE1, 0x4E, 0xFB};
    return detail::Dec(v, sizeof(v), 0xDC832845u);
}

SLX9_FORCE_INLINE std::string X178() {
    static const uint8_t v[] = {0xCF, 0xDC, 0xB8, 0xAB, 0xC7, 0xEF, 0x2F, 0x30, 0x16, 0xB7, 0xA0, 0xE1, 0xB7, 0x31, 0xCA, 0xAA, 0x4A, 0xB7, 0xF1, 0x49, 0x48, 0xEE, 0x56};
    return detail::Dec(v, sizeof(v), 0x2FD6C591u);
}
} // namespace lit


struct Options {
    std::string api_url = lit::X000();
    std::string url_get_key = lit::X001();
    std::string url_telegram = lit::X002();
    std::string url_youtube = lit::X003();
    std::string url_zalo = lit::X004();
    std::string url_zalo_admin_sunny = lit::X005();
    std::string url_zalo_admin_zudarus = lit::X006();
    std::string url_tiktok = lit::X007();

    int poll_interval_ms = 12 * 60 * 1000; // 12m: logout after block/reset in about 10-15 minutes, saving Supabase verify quota
    int max_auth_lease_seconds = 15 * 60; // 15m local lease cap; backup fail-closed if polling is delayed
    bool allow_lifetime_keys = false;
    bool allow_insecure_ssl_fallback = false; // deprecated: kept for source compatibility; SSL fallback is not used
    bool show_license_hud = true;
};


using UnityCreateStringFn = void* (*)(const char*);
using UnityOpenUrlFn = void (*)(void*);

enum LinkId {
    LINK_GET_KEY = 0,
    LINK_YOUTUBE,
    LINK_ZALO,
    LINK_TIKTOK,
    LINK_TELEGRAM,
    LINK_ZALO_ADMIN_SUNNY,
    LINK_ZALO_ADMIN_ZUDARUS
};

struct LicState {
    bool ok = false;
    bool started = false;
    bool has_remaining = false;
    int max_devices = 0;
    long long remaining_seconds = -1;
    std::string msg;
    std::string expires_at;
    std::string server_time;
};

struct ModuleState {
#ifdef __ANDROID__
    JavaVM* jvm = nullptr;
    jobject activity = nullptr; // global ref
#endif

    Options options;
    LicState lic;

    std::array<char, 256> key_input{};
    std::mutex login_lock;
    std::atomic<bool> login_in_progress{false};
    std::atomic<bool> poll_inflight{false};

    // UI hint only. Authorization is validated by auth_* fields below.
    bool ui_login_shadow = false;
    uint32_t auth_phase = 0;
    uint32_t auth_flags = 0;
    uint64_t auth_epoch = 0;
    uint64_t auth_key_hash = 0;
    uint64_t auth_device_hash = 0;
    uint64_t auth_until_ms = 0;
    uint64_t auth_tag_a = 0;
    uint64_t auth_tag_b = 0;
    bool show_info_key = false;
    bool loginui_inited = false;
    bool loginui_auto_key = false;
    bool loginui_save_key = false;
    bool loginui_auto_login_triggered = false;
    bool loginui_pending_save = false;

    std::string loginui_cfg_path;
    std::string loginui_package_name;
    std::string loginui_saved_key;
    std::string last_msg;

    std::string active_key;
    std::string active_device;
    std::string active_device_name;

    long long remaining_seconds_at_sync = -1;
    std::chrono::steady_clock::time_point remaining_sync_tp = std::chrono::steady_clock::now();
    bool license_started = false;
    std::string license_expires_at;
    std::string license_server_time;

    uint64_t next_poll_ms = 0;
    std::string ca_bundle_path;

    UnityCreateStringFn unity_create_string = nullptr;
    UnityOpenUrlFn unity_open_url = nullptr;

    std::string pending_open_url;
    std::string last_open_url;
    uint64_t last_open_url_ms = 0;
    uint64_t open_url_cooldown_ms = 900;
};

static ModuleState& S() {
    static ModuleState s;
    return s;
}

static inline uint64_t RotL64(uint64_t x, unsigned r) {
    return (x << r) | (x >> (64u - r));
}

static inline uint64_t Mix64(uint64_t x) {
    x ^= x >> 33;
    x *= 0xff51afd7ed558ccdULL;
    x ^= x >> 33;
    x *= 0xc4ceb9fe1a85ec53ULL;
    x ^= x >> 33;
    return x;
}

static inline uint64_t Hash64Bytes(const void* data, size_t n, uint64_t seed = 0xcbf29ce484222325ULL) {
    const uint8_t* p = (const uint8_t*)data;
    uint64_t h = seed ^ 0x9e3779b97f4a7c15ULL;
    for (size_t i = 0; i < n; ++i) {
        h ^= (uint64_t)p[i];
        h *= 0x100000001b3ULL;
        h = RotL64(h, 7) ^ (h >> 3);
    }
    return Mix64(h ^ (uint64_t)n);
}

static inline uint64_t Hash64String(const std::string& s, uint64_t seed = 0xcbf29ce484222325ULL) {
    return Hash64Bytes(s.data(), s.size(), seed);
}

enum AuthPhase : uint32_t {
    AUTH_PHASE_NONE = 0x41553000u,
    AUTH_PHASE_READY = 0x41554F4Bu
};

enum AuthFlag : uint32_t {
    AUTH_FLAG_REMOTE_OK = 1u << 0,
    AUTH_FLAG_KEY_BOUND = 1u << 1,
    AUTH_FLAG_DEVICE_BOUND = 1u << 2,
    AUTH_FLAG_TIME_BOUND = 1u << 3
};

static inline uint64_t ComputeAuthTag(uint32_t phase,
                                      uint32_t flags,
                                      uint64_t epoch,
                                      uint64_t key_hash,
                                      uint64_t device_hash,
                                      uint64_t until_ms) {
    uint64_t x = 0xD6E8FEB86659FD93ULL;
    x ^= ((uint64_t)phase << 32) ^ flags;
    x = Mix64(x ^ RotL64(epoch, 11));
    x = Mix64(x ^ RotL64(key_hash, 23));
    x = Mix64(x ^ RotL64(device_hash, 37));
    x = Mix64(x ^ RotL64(until_ms, 5));
    x ^= 0xA5A55A5AA55A5AA5ULL;
    return Mix64(x);
}

static inline void AuthClear() {
    S().ui_login_shadow = false;
    S().auth_phase = AUTH_PHASE_NONE;
    S().auth_flags = 0;
    S().auth_epoch = 0;
    S().auth_key_hash = 0;
    S().auth_device_hash = 0;
    S().auth_until_ms = 0;
    S().auth_tag_a = 0;
    S().auth_tag_b = 0;
}

#if defined(__ANDROID__) && defined(SUNNY_LOGIN_DEBUG)
static inline void LogI(const char* tag, const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    __android_log_vprint(ANDROID_LOG_INFO, tag, fmt, ap);
    va_end(ap);
}
#else
static inline void LogI(const char*, const char*, ...) {}
#endif

static inline uint64_t NowMs() {
    using namespace std::chrono;
    return (uint64_t)duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

static inline std::string Trim(const std::string& s) {
    size_t b = 0, e = s.size();
    while (b < e && std::isspace((unsigned char)s[b])) b++;
    while (e > b && std::isspace((unsigned char)s[e - 1])) e--;
    return s.substr(b, e - b);
}

static inline void TrimInPlace(std::string& s) {
    s = Trim(s);
}

static inline std::string ToUpperTrimmed(std::string s) {
    s.erase(std::remove_if(s.begin(), s.end(), [](unsigned char c) {
        return std::isspace(c) != 0;
    }), s.end());
    for (char& c : s) c = (char)std::toupper((unsigned char)c);
    return s;
}

static inline bool IsValidKeyFormat(const std::string& k) {
    if (k.size() != 20) return false;
    if (k.rfind(lit::X008(), 0) != 0) return false;
    auto isAZ09 = [](char c) {
        return (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
    };
    for (int i = 5; i < 20; ++i) {
        if (i == 5 || i == 10 || i == 15) {
            if (k[i] != '-') return false;
        } else {
            if (!isAZ09(k[i])) return false;
        }
    }
    return true;
}

static inline std::string x46(const std::string& code) {
    if (code == lit::X009()) return lit::X009();
    if (code == lit::X010()) return lit::X011();
    if (code == lit::X012()) return lit::X013();
    if (code == lit::X014()) return lit::X015();
    if (code == lit::X016()) return lit::X017();
    if (code == lit::X018()) return lit::X019();
    if (code == lit::X020()) return lit::X021();
    if (code == lit::X022()) return lit::X023();
    if (code == lit::X024()) return lit::X025();
    if (code == lit::X026()) return lit::X027();
    return code;
}

#ifdef __ANDROID__
static inline void JniClearException(JNIEnv* env) {
    if (env && env->ExceptionCheck()) env->ExceptionClear();
}

static jobject GetContextSafe(JNIEnv* env) {
    if (!env) return nullptr;
    if (S().activity) return S().activity;

    jclass unityPlayer = env->FindClass(lit::X028().c_str());
    JniClearException(env);
    if (unityPlayer) {
        jfieldID fid = env->GetStaticFieldID(unityPlayer, lit::X029().c_str(), lit::X030().c_str());
        JniClearException(env);
        if (fid) {
            jobject act = env->GetStaticObjectField(unityPlayer, fid);
            JniClearException(env);
            if (act) {
                S().activity = env->NewGlobalRef(act);
                env->DeleteLocalRef(act);
                return S().activity;
            }
        }
        env->DeleteLocalRef(unityPlayer);
    }

    jclass activityThreadCls = env->FindClass(lit::X031().c_str());
    JniClearException(env);
    if (activityThreadCls) {
        jmethodID midCurrent = env->GetStaticMethodID(activityThreadCls, lit::X032().c_str(), lit::X033().c_str());
        JniClearException(env);
        jobject at = midCurrent ? env->CallStaticObjectMethod(activityThreadCls, midCurrent) : nullptr;
        JniClearException(env);
        if (at) {
            jmethodID midApp = env->GetMethodID(activityThreadCls, lit::X034().c_str(), lit::X035().c_str());
            JniClearException(env);
            jobject app = midApp ? env->CallObjectMethod(at, midApp) : nullptr;
            JniClearException(env);
            if (app) {
                S().activity = env->NewGlobalRef(app);
                env->DeleteLocalRef(app);
                env->DeleteLocalRef(at);
                env->DeleteLocalRef(activityThreadCls);
                return S().activity;
            }
            env->DeleteLocalRef(at);
        }
        env->DeleteLocalRef(activityThreadCls);
    }

    return nullptr;
}

static inline bool GetEnv(JNIEnv** out_env, bool* needs_detach) {
    if (!out_env || !S().jvm) return false;
    *out_env = nullptr;
    if (needs_detach) *needs_detach = false;

    jint st = S().jvm->GetEnv((void**)out_env, JNI_VERSION_1_6);
    if (st == JNI_EDETACHED) {
        if (S().jvm->AttachCurrentThread(out_env, nullptr) != JNI_OK) return false;
        if (needs_detach) *needs_detach = true;
    }
    return *out_env != nullptr;
}

static inline std::string GetFilesDirPathSafe() {
    JNIEnv* env = nullptr;
    bool needs_detach = false;
    if (!GetEnv(&env, &needs_detach)) return "";

    std::string out;
    jobject ctx = GetContextSafe(env);
    if (ctx) {
        jclass ctxCls = env->GetObjectClass(ctx);
        jmethodID midGetFilesDir = ctxCls ? env->GetMethodID(ctxCls, lit::X036().c_str(), lit::X037().c_str()) : nullptr;
        JniClearException(env);

        jobject fileObj = midGetFilesDir ? env->CallObjectMethod(ctx, midGetFilesDir) : nullptr;
        JniClearException(env);

        if (fileObj) {
            jclass fileCls = env->GetObjectClass(fileObj);
            jmethodID midAbs = fileCls ? env->GetMethodID(fileCls, lit::X038().c_str(), lit::X039().c_str()) : nullptr;
            JniClearException(env);
            jstring jpath = midAbs ? (jstring)env->CallObjectMethod(fileObj, midAbs) : nullptr;
            JniClearException(env);

            if (jpath) {
                const char* c = env->GetStringUTFChars(jpath, nullptr);
                if (c) {
                    out = c;
                    env->ReleaseStringUTFChars(jpath, c);
                }
                env->DeleteLocalRef(jpath);
            }
            if (fileCls) env->DeleteLocalRef(fileCls);
            env->DeleteLocalRef(fileObj);
        }
        if (ctxCls) env->DeleteLocalRef(ctxCls);
    }

    if (needs_detach) S().jvm->DetachCurrentThread();
    return out;
}

static inline std::string GetAndroidIdJNI() {
    JNIEnv* env = nullptr;
    bool needs_detach = false;
    if (!GetEnv(&env, &needs_detach)) return "";

    std::string out;
    jobject ctx = GetContextSafe(env);
    if (ctx) {
        jclass ctxCls = env->GetObjectClass(ctx);
        jmethodID midCR = ctxCls ? env->GetMethodID(ctxCls, lit::X040().c_str(), lit::X041().c_str()) : nullptr;
        JniClearException(env);
        jobject cr = midCR ? env->CallObjectMethod(ctx, midCR) : nullptr;
        JniClearException(env);

        if (cr) {
            jclass secureCls = env->FindClass(lit::X042().c_str());
            JniClearException(env);
            if (secureCls) {
                jmethodID midGetString = env->GetStaticMethodID(
                    secureCls, lit::X043().c_str(),
                    lit::X044().c_str()
                );
                JniClearException(env);

                jstring jkey = env->NewStringUTF(lit::X045().c_str());
                jstring jid = midGetString ? (jstring)env->CallStaticObjectMethod(secureCls, midGetString, cr, jkey) : nullptr;
                JniClearException(env);

                if (jid) {
                    const char* c = env->GetStringUTFChars(jid, nullptr);
                    if (c) {
                        out = c;
                        env->ReleaseStringUTFChars(jid, c);
                    }
                    env->DeleteLocalRef(jid);
                }

                if (jkey) env->DeleteLocalRef(jkey);
                env->DeleteLocalRef(secureCls);
            }
            env->DeleteLocalRef(cr);
        }
        if (ctxCls) env->DeleteLocalRef(ctxCls);
    }

    if (needs_detach) S().jvm->DetachCurrentThread();
    return Trim(out);
}

static inline std::string GetClipboardSafe() {
    JNIEnv* env = nullptr;
    bool needs_detach = false;
    if (!GetEnv(&env, &needs_detach)) return "";

    std::string out;
    jobject ctx = GetContextSafe(env);
    if (ctx) {
        jclass ctxCls = env->GetObjectClass(ctx);
        jmethodID midGetService = ctxCls ? env->GetMethodID(ctxCls, lit::X046().c_str(), lit::X047().c_str()) : nullptr;
        JniClearException(env);

        jstring svc = env->NewStringUTF(lit::X048().c_str());
        jobject cm = midGetService ? env->CallObjectMethod(ctx, midGetService, svc) : nullptr;
        JniClearException(env);
        if (svc) env->DeleteLocalRef(svc);

        if (cm) {
            jclass cmCls = env->GetObjectClass(cm);
            jmethodID midHas = cmCls ? env->GetMethodID(cmCls, lit::X049().c_str(), lit::X050().c_str()) : nullptr;
            jmethodID midGet = cmCls ? env->GetMethodID(cmCls, lit::X051().c_str(), lit::X052().c_str()) : nullptr;
            JniClearException(env);

            if (midHas && midGet && env->CallBooleanMethod(cm, midHas)) {
                jobject clipData = env->CallObjectMethod(cm, midGet);
                JniClearException(env);

                if (clipData) {
                    jclass clipCls = env->GetObjectClass(clipData);
                    jmethodID midItem = clipCls ? env->GetMethodID(clipCls, lit::X053().c_str(), lit::X054().c_str()) : nullptr;
                    JniClearException(env);
                    jobject item = midItem ? env->CallObjectMethod(clipData, midItem, 0) : nullptr;
                    JniClearException(env);

                    if (item) {
                        jclass itemCls = env->GetObjectClass(item);
                        jmethodID midCoerce = itemCls ? env->GetMethodID(itemCls, lit::X055().c_str(), lit::X056().c_str()) : nullptr;
                        JniClearException(env);

                        jobject textObj = midCoerce ? env->CallObjectMethod(item, midCoerce, ctx) : nullptr;
                        JniClearException(env);

                        if (!textObj) {
                            jmethodID midGetText = itemCls ? env->GetMethodID(itemCls, lit::X057().c_str(), lit::X058().c_str()) : nullptr;
                            JniClearException(env);
                            textObj = midGetText ? env->CallObjectMethod(item, midGetText) : nullptr;
                            JniClearException(env);
                        }

                        if (textObj) {
                            jclass csCls = env->GetObjectClass(textObj);
                            jmethodID midToString = csCls ? env->GetMethodID(csCls, lit::X059().c_str(), lit::X039().c_str()) : nullptr;
                            JniClearException(env);
                            jstring jtext = midToString ? (jstring)env->CallObjectMethod(textObj, midToString) : nullptr;
                            JniClearException(env);

                            if (jtext) {
                                const char* c = env->GetStringUTFChars(jtext, nullptr);
                                if (c) {
                                    out = c;
                                    env->ReleaseStringUTFChars(jtext, c);
                                }
                                env->DeleteLocalRef(jtext);
                            }

                            if (csCls) env->DeleteLocalRef(csCls);
                            env->DeleteLocalRef(textObj);
                        }

                        if (itemCls) env->DeleteLocalRef(itemCls);
                        env->DeleteLocalRef(item);
                    }

                    if (clipCls) env->DeleteLocalRef(clipCls);
                    env->DeleteLocalRef(clipData);
                }
            }

            if (out.empty()) {
                jmethodID midGetTextOld = cmCls ? env->GetMethodID(cmCls, lit::X057().c_str(), lit::X058().c_str()) : nullptr;
                JniClearException(env);
                if (midGetTextOld) {
                    jobject textObj = env->CallObjectMethod(cm, midGetTextOld);
                    JniClearException(env);
                    if (textObj) {
                        jclass csCls = env->GetObjectClass(textObj);
                        jmethodID midToString = csCls ? env->GetMethodID(csCls, lit::X059().c_str(), lit::X039().c_str()) : nullptr;
                        JniClearException(env);
                        jstring jtext = midToString ? (jstring)env->CallObjectMethod(textObj, midToString) : nullptr;
                        JniClearException(env);
                        if (jtext) {
                            const char* c = env->GetStringUTFChars(jtext, nullptr);
                            if (c) {
                                out = c;
                                env->ReleaseStringUTFChars(jtext, c);
                            }
                            env->DeleteLocalRef(jtext);
                        }
                        if (csCls) env->DeleteLocalRef(csCls);
                        env->DeleteLocalRef(textObj);
                    }
                }
            }

            if (cmCls) env->DeleteLocalRef(cmCls);
            env->DeleteLocalRef(cm);
        }

        if (ctxCls) env->DeleteLocalRef(ctxCls);
    }

    if (needs_detach) S().jvm->DetachCurrentThread();
    return out;
}

static inline void OpenUrlJNI(const char* url) {
    if (!url || !*url) return;

    JNIEnv* env = nullptr;
    bool needs_detach = false;
    if (!GetEnv(&env, &needs_detach)) return;

    jobject ctx = GetContextSafe(env);
    if (!ctx) {
        if (needs_detach) S().jvm->DetachCurrentThread();
        return;
    }

    jclass intentCls = env->FindClass(lit::X060().c_str());
    jclass uriCls = env->FindClass(lit::X061().c_str());
    JniClearException(env);

    if (!intentCls || !uriCls) {
        if (intentCls) env->DeleteLocalRef(intentCls);
        if (uriCls) env->DeleteLocalRef(uriCls);
        if (needs_detach) S().jvm->DetachCurrentThread();
        return;
    }

    jfieldID fidActionView = env->GetStaticFieldID(intentCls, lit::X062().c_str(), lit::X063().c_str());
    JniClearException(env);
    jstring actionView = fidActionView ? (jstring)env->GetStaticObjectField(intentCls, fidActionView) : nullptr;
    JniClearException(env);

    jmethodID midParse = env->GetStaticMethodID(uriCls, lit::X064().c_str(), lit::X065().c_str());
    jmethodID midCtor = env->GetMethodID(intentCls, lit::X066().c_str(), lit::X067().c_str());
    JniClearException(env);

    jstring jurl = env->NewStringUTF(url);
    jobject uri = (midParse && jurl) ? env->CallStaticObjectMethod(uriCls, midParse, jurl) : nullptr;
    JniClearException(env);
    jobject intent = (midCtor && actionView && uri) ? env->NewObject(intentCls, midCtor, actionView, uri) : nullptr;
    JniClearException(env);

    if (intent) {
        jmethodID midStart = env->GetMethodID(env->GetObjectClass(ctx), lit::X068().c_str(), lit::X069().c_str());
        JniClearException(env);
        if (midStart) {
            env->CallVoidMethod(ctx, midStart, intent);
            JniClearException(env);
        }
    }

    if (intent) env->DeleteLocalRef(intent);
    if (uri) env->DeleteLocalRef(uri);
    if (jurl) env->DeleteLocalRef(jurl);
    if (actionView) env->DeleteLocalRef(actionView);
    env->DeleteLocalRef(uriCls);
    env->DeleteLocalRef(intentCls);

    if (needs_detach) S().jvm->DetachCurrentThread();
}
#else
static inline std::string GetFilesDirPathSafe() { return "."; }
static inline std::string GetAndroidIdJNI() { return ""; }
static inline std::string GetClipboardSafe() { return ""; }
static inline void OpenUrlJNI(const char*) {}
#endif


static inline const char* GetLinkById(int id) {
    switch (id) {
        case LINK_GET_KEY: return S().options.url_get_key.c_str();
        case LINK_YOUTUBE: return S().options.url_youtube.c_str();
        case LINK_ZALO: return S().options.url_zalo.c_str();
        case LINK_TIKTOK: return S().options.url_tiktok.c_str();
        case LINK_TELEGRAM: return S().options.url_telegram.c_str();
        case LINK_ZALO_ADMIN_SUNNY: return S().options.url_zalo_admin_sunny.c_str();
        case LINK_ZALO_ADMIN_ZUDARUS: return S().options.url_zalo_admin_zudarus.c_str();
        default: return nullptr;
    }
}

static inline void OpenExternalUrlSafe(const char* url) {
    if (!url || !*url) return;

    if (S().unity_create_string && S().unity_open_url) {
        void* unity_str = S().unity_create_string(url);
        if (unity_str) {
            S().unity_open_url(unity_str);
            return;
        }
    }

    OpenUrlJNI(url);
}

static inline void RequestOpenUrl(int link_id) {
    const char* url = GetLinkById(link_id);
    if (!url || !url[0]) return;

    const uint64_t now = NowMs();
    if (S().last_open_url == url && (now - S().last_open_url_ms) < S().open_url_cooldown_ms) {
        return;
    }

    S().pending_open_url = url;
    S().last_open_url = url;
    S().last_open_url_ms = now;
}

static inline void FlushPendingOpenUrl() {
    if (S().pending_open_url.empty()) return;
    const std::string url = S().pending_open_url;
    S().pending_open_url.clear();
    OpenExternalUrlSafe(url.c_str());
}


static inline std::string GetPackageNameSafe() {
    if (!S().loginui_package_name.empty()) return S().loginui_package_name;
#ifdef __ANDROID__
    JNIEnv* env = nullptr;
    bool needs_detach = false;
    if (!GetEnv(&env, &needs_detach)) return "";

    std::string out;
    jobject ctx = GetContextSafe(env);
    if (ctx) {
        jclass ctxCls = env->GetObjectClass(ctx);
        jmethodID midGetPkg = ctxCls ? env->GetMethodID(ctxCls, lit::X070().c_str(), lit::X039().c_str()) : nullptr;
        JniClearException(env);
        jstring jpkg = midGetPkg ? (jstring)env->CallObjectMethod(ctx, midGetPkg) : nullptr;
        JniClearException(env);
        if (jpkg) {
            const char* c = env->GetStringUTFChars(jpkg, nullptr);
            if (c) {
                out = c;
                env->ReleaseStringUTFChars(jpkg, c);
            }
            env->DeleteLocalRef(jpkg);
        }
        if (ctxCls) env->DeleteLocalRef(ctxCls);
    }
    if (needs_detach) S().jvm->DetachCurrentThread();
    S().loginui_package_name = out;
    return out;
#else
    return "";
#endif
}

static inline bool EnsureParentDirForFile(const std::string& path) {
#ifdef __ANDROID__
    if (path.empty()) return false;
    const size_t pos = path.find_last_of('/');
    if (pos == std::string::npos) return false;
    const std::string dir = path.substr(0, pos);
    if (dir.empty()) return false;

    std::string current;
    size_t start = 0;
    if (!dir.empty() && dir[0] == '/') {
        current = "/";
        start = 1;
    }

    while (start <= dir.size()) {
        size_t slash = dir.find('/', start);
        std::string part = (slash == std::string::npos) ? dir.substr(start) : dir.substr(start, slash - start);
        if (!part.empty()) {
            if (!current.empty() && current.back() != '/') current.push_back('/');
            current += part;
            mkdir(current.c_str(), 0777);
        }
        if (slash == std::string::npos) break;
        start = slash + 1;
    }
    return true;
#else
    (void)path;
    return false;
#endif
}

static inline std::vector<std::string> x58(bool only_existing) {
    std::vector<std::string> out;

    auto push_if = [&](const std::string& s) {
        if (s.empty()) return;
        if (std::find(out.begin(), out.end(), s) != out.end()) return;
#ifdef __ANDROID__
        if (only_existing) {
            if (access(s.c_str(), F_OK) == 0) out.push_back(s);
        } else {
            out.push_back(s);
        }
#else
        out.push_back(s);
#endif
    };

    const std::string filesDir = GetFilesDirPathSafe();
    if (!filesDir.empty()) push_if(filesDir + lit::X071());

    const std::string pkg = GetPackageNameSafe();
    if (!pkg.empty()) {
        push_if(lit::X072() + pkg + lit::X073());
        push_if(lit::X074() + pkg + lit::X073());
    }

    push_if(lit::X075());
    push_if(lit::X076());
    return out;
}

static inline std::string x59(bool prefer_existing) {
    auto existing = x58(true);
    if (!existing.empty()) return existing.front();
    if (prefer_existing) return "";
    auto writable = x58(false);
    if (!writable.empty()) return writable.front();
    return "";
}

static inline std::string x62() {
    std::string id = GetAndroidIdJNI();

#ifdef __ANDROID__
    if (id.empty()) {
        std::string cmd = lit::X077();
        FILE* fp = popen(cmd.c_str(), "r");
        if (fp) {
            char buf[128] = {0};
            if (fgets(buf, sizeof(buf), fp)) id = buf;
            pclose(fp);
        }
    }
#endif

    id = Trim(id);
    if (id.empty()) id = lit::X078();
    if (id.size() > 120) id.resize(120);
    return id;
}

static inline std::string x63() {
#ifdef __ANDROID__
    char model[128] = {0};
    std::string cmd = lit::X079();
    FILE* fp = popen(cmd.c_str(), "r");
    if (fp) {
        if (fgets(model, sizeof(model) - 1, fp)) {
            pclose(fp);
            std::string s(model);
            while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();
            if (!s.empty()) return s;
        } else {
            pclose(fp);
        }
    }
#endif
    return lit::X080();
}

static inline std::string x60() {
    if (!S().loginui_cfg_path.empty()) return S().loginui_cfg_path;
    S().loginui_cfg_path = x59(false);
    return S().loginui_cfg_path;
}


static inline std::string x64(const std::string& in) {
    static const char hx[] = "0123456789ABCDEF";
    std::string out;
    out.reserve(in.size() * 2);
    uint32_t st = 0x7A53C91Du;
    for (size_t i = 0; i < in.size(); ++i) {
        st = st * 1664525u + 1013904223u + (uint32_t)i;
        uint8_t k = (uint8_t)((st >> 16) ^ (st >> 7) ^ (0xA5u + (uint32_t)i * 13u));
        uint8_t b = (uint8_t)in[i] ^ k;
        out.push_back(hx[(b >> 4) & 0x0F]);
        out.push_back(hx[b & 0x0F]);
    }
    return out;
}

static inline int x65(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static inline bool x66(const std::string& in, std::string& out) {
    if ((in.size() & 1u) != 0u) return false;
    out.clear();
    out.reserve(in.size() / 2);
    uint32_t st = 0x7A53C91Du;
    for (size_t i = 0; i < in.size(); i += 2) {
        int hi = x65(in[i]);
        int lo = x65(in[i + 1]);
        if (hi < 0 || lo < 0) return false;
        st = st * 1664525u + 1013904223u + (uint32_t)(i / 2);
        uint8_t k = (uint8_t)((st >> 16) ^ (st >> 7) ^ (0xA5u + (uint32_t)(i / 2) * 13u));
        uint8_t b = (uint8_t)((hi << 4) | lo);
        out.push_back((char)(b ^ k));
    }
    return true;
}

static inline void x55() {
    if (S().loginui_inited && !S().loginui_cfg_path.empty()) return;

    std::string path = x59(true);
    if (path.empty()) {
        // Không khóa cứng ở đây, để những frame sau còn thử lại khi context/package đã sẵn sàng.
        return;
    }

    S().loginui_cfg_path = path;
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) {
        S().loginui_inited = true;
        return;
    }

    S().key_input[0] = '\0';
    S().loginui_saved_key.clear();

    char line[512];
    while (fgets(line, sizeof(line), f)) {
        std::string s(line);
        TrimInPlace(s);
        if (s.rfind(lit::X081(), 0) == 0) {
            const size_t p = lit::X081().size();
            S().loginui_auto_key = (s.size() > p && s[p] == '1');
        } else if (s.rfind(lit::X082(), 0) == 0) {
            const size_t p = lit::X082().size();
            S().loginui_save_key = (s.size() > p && s[p] == '1');
        } else if (s.rfind(lit::X083(), 0) == 0) {
            std::string k = s.substr(lit::X083().size());
            TrimInPlace(k);
            std::string decoded;
            if (x66(k, decoded) && IsValidKeyFormat(ToUpperTrimmed(decoded))) {
                k = ToUpperTrimmed(decoded);
            } else {
                k = ToUpperTrimmed(k);
            }
            if (!k.empty() && IsValidKeyFormat(k)) {
                std::snprintf(S().key_input.data(), S().key_input.size(), "%s", k.c_str());
                S().loginui_saved_key = k;
            }
        }
    }
    fclose(f);
    S().loginui_inited = true;

    if (!S().loginui_save_key) {
        S().key_input[0] = '\0';
        S().loginui_saved_key.clear();
    }
}

static inline void x61() {
    std::string path = x60();
    if (path.empty()) {
        path = x59(false);
        if (path.empty()) return;
        S().loginui_cfg_path = path;
    }

    EnsureParentDirForFile(path);
    FILE* f = fopen(path.c_str(), "wb");
    if (!f) {
        auto candidates = x58(false);
        for (const auto& c : candidates) {
            EnsureParentDirForFile(c);
            f = fopen(c.c_str(), "wb");
            if (f) {
                S().loginui_cfg_path = c;
                break;
            }
        }
        if (!f) return;
    }

    std::fprintf(f, lit::X084().c_str(), S().loginui_auto_key ? 1 : 0);
    std::fprintf(f, lit::X085().c_str(), S().loginui_save_key ? 1 : 0);
    std::string key_to_save;
    if (S().loginui_save_key) {
        std::string raw = S().loginui_saved_key.empty() ? std::string(S().key_input.data()) : S().loginui_saved_key;
        raw = ToUpperTrimmed(raw);
        if (IsValidKeyFormat(raw)) key_to_save = x64(raw);
    }
    std::fprintf(f, lit::X086().c_str(), key_to_save.c_str());
    fclose(f);
    S().loginui_inited = true;
}

static inline void x56() {
    if (!S().loginui_pending_save) return;
    S().loginui_pending_save = false;
    x61();
}

static inline void x57(bool force_clear = false) {
    if (force_clear) {
        S().loginui_saved_key.clear();
        S().loginui_pending_save = true;
        x61();
        S().loginui_pending_save = false;
        return;
    }

    if (S().loginui_save_key) {
        S().loginui_saved_key = ToUpperTrimmed(std::string(S().key_input.data()));
    } else {
        S().loginui_saved_key.clear();
    }
    S().loginui_pending_save = true;
    x61();
    S().loginui_pending_save = false;
}

// ===== SHA256 / HMAC =====
SLX9_FORCE_INLINE std::string ToHex(const uint8_t* data, size_t len) {
    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (size_t i = 0; i < len; ++i) oss << std::setw(2) << (int)data[i];
    return oss.str();
}

SLX9_FORCE_INLINE uint32_t ROR32(uint32_t x, uint32_t n) {
    return (x >> n) | (x << (32 - n));
}

SLX9_FORCE_INLINE void SHA256(const uint8_t* data, size_t len, uint8_t out[32]) {
    static const uint32_t k[64] = {
        0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
        0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
        0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
        0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
        0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
        0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
        0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
        0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
    };

    uint32_t h[8] = {
        0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,
        0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u
    };

    auto read_be32 = [](const uint8_t* p) -> uint32_t {
        return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | (uint32_t)p[3];
    };
    auto write_be32 = [](uint8_t* p, uint32_t v) {
        p[0] = (uint8_t)(v >> 24);
        p[1] = (uint8_t)(v >> 16);
        p[2] = (uint8_t)(v >> 8);
        p[3] = (uint8_t)v;
    };

    auto compress = [&](const uint8_t* block) {
        uint32_t w[64];
        for (int i = 0; i < 16; ++i) w[i] = read_be32(block + i * 4);
        for (int i = 16; i < 64; ++i) {
            uint32_t s0 = ROR32(w[i - 15], 7) ^ ROR32(w[i - 15], 18) ^ (w[i - 15] >> 3);
            uint32_t s1 = ROR32(w[i - 2], 17) ^ ROR32(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }

        uint32_t a = h[0], b = h[1], c = h[2], d = h[3];
        uint32_t e = h[4], f = h[5], g = h[6], hh = h[7];

        for (int i = 0; i < 64; ++i) {
            uint32_t S1 = ROR32(e, 6) ^ ROR32(e, 11) ^ ROR32(e, 25);
            uint32_t ch = (e & f) ^ ((~e) & g);
            uint32_t temp1 = hh + S1 + ch + k[i] + w[i];
            uint32_t S0 = ROR32(a, 2) ^ ROR32(a, 13) ^ ROR32(a, 22);
            uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
            uint32_t temp2 = S0 + maj;

            hh = g; g = f; f = e; e = d + temp1;
            d = c; c = b; b = a; a = temp1 + temp2;
        }

        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    };

    uint8_t block[64];
    size_t off = 0;
    uint64_t bit_len = (uint64_t)len * 8ull;

    while (off + 64 <= len) {
        compress(data + off);
        off += 64;
    }

    size_t rem = len - off;
    for (size_t i = 0; i < rem; ++i) block[i] = data[off + i];
    block[rem++] = 0x80;

    if (rem > 56) {
        for (size_t i = rem; i < 64; ++i) block[i] = 0;
        compress(block);
        rem = 0;
    }

    for (size_t i = rem; i < 56; ++i) block[i] = 0;
    for (int i = 0; i < 8; ++i) block[63 - i] = (uint8_t)(bit_len >> (8 * i));
    compress(block);

    for (int i = 0; i < 8; ++i) write_be32(out + i * 4, h[i]);
}

SLX9_FORCE_INLINE std::string SHA256Hex(const std::string& s) {
    uint8_t out[32];
    SHA256((const uint8_t*)s.data(), s.size(), out);
    return ToHex(out, 32);
}

SLX9_FORCE_INLINE std::string HmacSha256Hex(const std::string& key, const std::string& msg) {
    const size_t BLOCK = 64;
    uint8_t k0[BLOCK];
    std::memset(k0, 0, sizeof(k0));

    if (key.size() > BLOCK) {
        uint8_t kh[32];
        SHA256((const uint8_t*)key.data(), key.size(), kh);
        std::memcpy(k0, kh, 32);
    } else {
        std::memcpy(k0, key.data(), key.size());
    }

    uint8_t ipad[BLOCK], opad[BLOCK];
    for (size_t i = 0; i < BLOCK; ++i) {
        ipad[i] = k0[i] ^ 0x36;
        opad[i] = k0[i] ^ 0x5c;
    }

    std::string inner_input;
    inner_input.resize(BLOCK + msg.size());
    std::memcpy(&inner_input[0], ipad, BLOCK);
    std::memcpy(&inner_input[BLOCK], msg.data(), msg.size());

    uint8_t inner_hash[32];
    SHA256((const uint8_t*)inner_input.data(), inner_input.size(), inner_hash);

    uint8_t outer_input[BLOCK + 32];
    std::memcpy(outer_input, opad, BLOCK);
    std::memcpy(outer_input + BLOCK, inner_hash, 32);

    uint8_t out[32];
    SHA256(outer_input, sizeof(outer_input), out);
    return ToHex(out, 32);
}

SLX9_FORCE_INLINE std::string GenNonceHex(size_t bytes = 16) {
    std::string buf(bytes, '\0');
#ifdef __ANDROID__
    std::string rnd = lit::X087();
    int fd = open(rnd.c_str(), O_RDONLY);
    if (fd >= 0) {
        ssize_t r = read(fd, &buf[0], bytes);
        close(fd);
        if (r != (ssize_t)bytes) {
            for (size_t i = 0; i < bytes; ++i) buf[i] = (char)(std::rand() & 0xFF);
        }
    } else {
        std::srand((unsigned)std::time(nullptr));
        for (size_t i = 0; i < bytes; ++i) buf[i] = (char)(std::rand() & 0xFF);
    }
#else
    std::srand((unsigned)std::time(nullptr));
    for (size_t i = 0; i < bytes; ++i) buf[i] = (char)(std::rand() & 0xFF);
#endif
    return ToHex((const uint8_t*)buf.data(), buf.size());
}

SLX9_FORCE_INLINE std::string JsonEscape(const std::string& in) {
    std::ostringstream oss;
    for (unsigned char c : in) {
        switch (c) {
            case '\\': oss << "\\\\"; break;
            case '"':  oss << "\\\""; break;
            case '\b': oss << "\\b"; break;
            case '\f': oss << "\\f"; break;
            case '\n': oss << "\\n"; break;
            case '\r': oss << "\\r"; break;
            case '\t': oss << "\\t"; break;
            default:
                if (c < 0x20) {
                    oss << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (int)c;
                } else {
                    oss << (char)c;
                }
        }
    }
    return oss.str();
}

SLX9_FORCE_INLINE std::string x45() {
    static const uint8_t k0[] = {0x5A, 0x19, 0x34, 0xE3};
    static const uint8_t k1[] = {0x6A, 0x8E, 0x6C, 0x2B, 0x93, 0x59, 0x3D};
    static const uint8_t k2[] = {0xD0, 0xFB, 0x6F};
    static const uint8_t k3[] = {0xB1, 0xD3, 0xC4, 0xE3, 0xB6, 0x43};
    static const uint8_t k4[] = {0x14, 0x07, 0xCF, 0x0A, 0xD8, 0x7B};
    static const uint8_t j0[] = {0x09, 0x48, 0x96, 0x9E, 0xD7, 0xD6, 0x6B, 0x07, 0x87, 0xD2};
    std::string out;
    out.reserve(26);
    out += detail::Dec(k0, sizeof(k0), 0x5324A45Cu);
    out += detail::Dec(k1, sizeof(k1), 0x8B282829u);
    out += detail::Dec(k2, sizeof(k2), 0x894BD027u);
    out += detail::Dec(k3, sizeof(k3), 0x0F5221FBu);
    out += detail::Dec(k4, sizeof(k4), 0x4E9C5432u);
    volatile uint32_t guard = (uint32_t)(out.size() ^ 0xA5A55A40u);
    if (guard == 0xA5A55A40u) out += detail::Dec(j0, sizeof(j0), 0xD85E40D1u);
    return out;
}

// ===== JSON parse =====
SLX9_FORCE_INLINE bool x47(const std::string& json, const char* key, std::string& out) {
    if (!key) return false;
    const std::string pat = std::string("\"") + key + "\"";
    size_t p = json.find(pat);
    if (p == std::string::npos) return false;
    p = json.find(':', p + pat.size());
    if (p == std::string::npos) return false;
    p++;
    while (p < json.size() && std::isspace((unsigned char)json[p])) p++;
    if (p >= json.size()) return false;

    if (json[p] == '"') {
        std::string v;
        p++;
        while (p < json.size()) {
            char c = json[p++];
            if (c == '\\' && p < json.size()) {
                char esc = json[p++];
                switch (esc) {
                    case '"': v.push_back('"'); break;
                    case '\\': v.push_back('\\'); break;
                    case '/': v.push_back('/'); break;
                    case 'b': v.push_back('\b'); break;
                    case 'f': v.push_back('\f'); break;
                    case 'n': v.push_back('\n'); break;
                    case 'r': v.push_back('\r'); break;
                    case 't': v.push_back('\t'); break;
                    default: v.push_back(esc); break;
                }
                continue;
            }
            if (c == '"') break;
            v.push_back(c);
        }
        out = v;
        return true;
    }

    size_t end = json.find_first_of(",}", p);
    if (end == std::string::npos) end = json.size();
    out = Trim(json.substr(p, end - p));
    return true;
}

SLX9_FORCE_INLINE bool x48(const std::string& json, const char* key, bool& out) {
    std::string tok;
    if (!x47(json, key, tok)) return false;
    if (tok == lit::X089()) { out = true; return true; }
    if (tok == lit::X090()) { out = false; return true; }
    return false;
}

SLX9_FORCE_INLINE bool x49(const std::string& json, const char* key, long long& out) {
    std::string tok;
    if (!x47(json, key, tok)) return false;
    if (tok.empty() || tok == lit::X091()) return false;
    char* endp = nullptr;
    long long v = std::strtoll(tok.c_str(), &endp, 10);
    if (endp == tok.c_str()) return false;
    out = v;
    return true;
}

SLX9_FORCE_INLINE bool x50(const std::string& json, const char* key, std::string& out) {
    std::string tok;
    if (!x47(json, key, tok)) return false;
    if (tok == lit::X091()) {
        out.clear();
        return true;
    }
    out = tok;
    return true;
}

SLX9_FORCE_INLINE bool x44(const std::string& response, std::string* err_out) {
    if (err_out) err_out->clear();

    LicState st;
    bool okField = false;
    if (!x48(response, lit::X092().c_str(), okField)) {
        if (err_out) *err_out = lit::X093();
        S().lic = st;
        return false;
    }

    st.ok = okField;
    (void)x50(response, lit::X094().c_str(), st.msg);
    (void)x50(response, lit::X095().c_str(), st.expires_at);
    (void)x50(response, lit::X096().c_str(), st.server_time);

    long long maxDev = 0;
    if (x49(response, lit::X097().c_str(), maxDev)) {
        if (maxDev < 0) maxDev = 0;
        st.max_devices = (int)maxDev;
    }

    bool started = false;
    if (x48(response, lit::X098().c_str(), started)) st.started = started;

    std::string remTok;
    if (x47(response, lit::X099().c_str(), remTok) && !remTok.empty() && remTok != lit::X091()) {
        char* endp = nullptr;
        long long rem = std::strtoll(remTok.c_str(), &endp, 10);
        if (endp != remTok.c_str()) {
            st.has_remaining = true;
            st.remaining_seconds = rem;
        }
    }

    if (!st.ok) {
        S().lic = st;
        S().remaining_sync_tp = std::chrono::steady_clock::now();
        S().remaining_seconds_at_sync = st.has_remaining ? st.remaining_seconds : -1;
        if (err_out) *err_out = st.msg.empty() ? lit::X100() : x46(st.msg);
        return false;
    }

    // Fail-closed: ok=true is not enough. A valid login must have positive remaining time.
    if ((!st.has_remaining || st.remaining_seconds <= 0) && !S().options.allow_lifetime_keys) {
        S().lic = LicState{};
        S().remaining_sync_tp = std::chrono::steady_clock::now();
        S().remaining_seconds_at_sync = -1;
        if (err_out) *err_out = lit::X103();
        return false;
    }

    S().lic = st;
    S().remaining_sync_tp = std::chrono::steady_clock::now();
    S().remaining_seconds_at_sync = st.has_remaining ? st.remaining_seconds : -1;
    return true;
}

SLX9_FORCE_INLINE long long GetRemainingSecondsNow() {
    if (S().remaining_seconds_at_sync < 0) return S().remaining_seconds_at_sync;
    const auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now() - S().remaining_sync_tp
    ).count();
    long long rem = S().remaining_seconds_at_sync - (long long)elapsed;
    if (rem < 0) rem = 0;
    return rem;
}

SLX9_FORCE_INLINE std::string FormatRemainingDHMS(long long seconds) {
    if (seconds < 0) return lit::X101();
    long long s = seconds;
    long long d = s / 86400; s %= 86400;
    long long h = s / 3600;  s %= 3600;
    long long m = s / 60;    s %= 60;

    char buf[64];
    if (d > 0) std::snprintf(buf, sizeof(buf), "%lldd %lldh %lldm", d, h, m);
    else if (h > 0) std::snprintf(buf, sizeof(buf), "%lldh %lldm", h, m);
    else std::snprintf(buf, sizeof(buf), "%lldm %llds", m, s);
    return std::string(buf);
}

SLX9_FORCE_INLINE std::string x52() {
    const long long rem = GetRemainingSecondsNow();
    if (rem >= 0) return FormatRemainingDHMS(rem);
    if (S().license_expires_at.empty()) return lit::X102();
    return lit::X101();
}

SLX9_FORCE_INLINE bool x53(std::string* out_reason = nullptr) {
    const long long rem = GetRemainingSecondsNow();
    if (rem == 0) {
        if (out_reason) *out_reason = lit::X103();
        return true;
    }
    if (rem < 0 && !S().options.allow_lifetime_keys) {
        if (out_reason) *out_reason = lit::X104();
        return true;
    }
    return false;
}

SLX9_FORCE_INLINE bool AuthLooksValid() {
    if (!S().ui_login_shadow) return false;
    if (S().auth_phase != AUTH_PHASE_READY) return false;
    if ((S().auth_flags & AUTH_FLAG_REMOTE_OK) == 0) return false;
    if ((S().auth_flags & AUTH_FLAG_KEY_BOUND) == 0) return false;
    if ((S().auth_flags & AUTH_FLAG_DEVICE_BOUND) == 0) return false;
    if (S().active_key.empty() || S().active_device.empty()) return false;
    if (S().auth_key_hash != Hash64String(S().active_key, 0x536E6E794B657931ULL)) return false;
    if (S().auth_device_hash != Hash64String(S().active_device, 0x536E6E7944657631ULL)) return false;

    const uint64_t tag = ComputeAuthTag(S().auth_phase,
                                        S().auth_flags,
                                        S().auth_epoch,
                                        S().auth_key_hash,
                                        S().auth_device_hash,
                                        S().auth_until_ms);
    if (S().auth_tag_a != tag) return false;
    if (S().auth_tag_b != (RotL64(~tag, 17) ^ 0x6C6F67696E2D7631ULL)) return false;

    std::string reason;
    if (x53(&reason)) return false;

    const uint64_t now = NowMs();
    if ((S().auth_flags & AUTH_FLAG_TIME_BOUND) && S().auth_until_ms != 0 && now > S().auth_until_ms + 1500ULL) {
        return false;
    }

    return true;
}

SLX9_FORCE_INLINE void AuthAccept(const std::string& key, const std::string& device) {
    const uint64_t now = NowMs();
    const long long rem = GetRemainingSecondsNow();

    S().auth_phase = AUTH_PHASE_READY;
    S().auth_flags = AUTH_FLAG_REMOTE_OK | AUTH_FLAG_KEY_BOUND | AUTH_FLAG_DEVICE_BOUND;
    S().auth_epoch = Mix64(now ^ Hash64String(key, 0x536E6E7945706F31ULL) ^ RotL64(Hash64String(device, 0x536E6E7945706F32ULL), 9));
    S().auth_key_hash = Hash64String(key, 0x536E6E794B657931ULL);
    S().auth_device_hash = Hash64String(device, 0x536E6E7944657631ULL);

    if (rem > 0) {
        S().auth_flags |= AUTH_FLAG_TIME_BOUND;
        long long lease = rem;
        if (S().options.max_auth_lease_seconds > 0 && lease > S().options.max_auth_lease_seconds) {
            lease = S().options.max_auth_lease_seconds;
        }
        const uint64_t rem_ms = (uint64_t)lease * 1000ULL;
        S().auth_until_ms = now + rem_ms;
    } else if (rem < 0 && S().options.allow_lifetime_keys) {
        S().auth_until_ms = UINT64_MAX;
    } else {
        S().auth_until_ms = 0;
    }

    const uint64_t tag = ComputeAuthTag(S().auth_phase,
                                        S().auth_flags,
                                        S().auth_epoch,
                                        S().auth_key_hash,
                                        S().auth_device_hash,
                                        S().auth_until_ms);
    S().auth_tag_a = tag;
    S().auth_tag_b = RotL64(~tag, 17) ^ 0x6C6F67696E2D7631ULL;
    S().ui_login_shadow = true;
}

// ===== SSL / curl =====
static inline bool PathReadable(const char* p, int mode) {
#ifdef __ANDROID__
    return (p && access(p, mode) == 0);
#else
    (void)mode;
    return p && *p;
#endif
}

static inline void x51() {
    if (!S().ca_bundle_path.empty()) return;
    std::string dir = GetFilesDirPathSafe();
    if (dir.empty()) return;
    S().ca_bundle_path = dir + lit::X105();

#ifdef __ANDROID__
    if (access(S().ca_bundle_path.c_str(), R_OK) == 0) return;
#endif

#if SUNNY_LOGIN_HAS_EMBEDDED_CA
    std::ofstream out(S().ca_bundle_path, std::ios::binary);
    if (!out.good()) {
        S().ca_bundle_path.clear();
        return;
    }
    out.write(SUNNY_CA_BUNDLE_PEM, (std::streamsize)(std::strlen(SUNNY_CA_BUNDLE_PEM)));
    out.close();
    LogI(lit::X106().c_str(), lit::X107().c_str(), S().ca_bundle_path.c_str());
#endif
}

static inline std::string FindSystemCaDir() {
#ifdef __ANDROID__
    const std::string candidates[] = {
        lit::X108(),
        lit::X109(),
    };
    for (const std::string& c : candidates) {
        if (PathReadable(c.c_str(), R_OK | X_OK)) return c;
    }
#endif
    return "";
}

static inline std::string FindCaBundleFile() {
    x51();
#ifdef __ANDROID__
    if (!S().ca_bundle_path.empty() && PathReadable(S().ca_bundle_path.c_str(), R_OK)) {
        return S().ca_bundle_path;
    }
    const std::string candidates[] = {
        lit::X110(),
        lit::X111(),
        lit::X112(),
    };
    for (const std::string& c : candidates) {
        if (PathReadable(c.c_str(), R_OK)) return c;
    }
#endif
    return S().ca_bundle_path;
}

static inline void ApplyCaToCurl(CURL* curl) {
    if (!curl) return;
    const std::string cafile = FindCaBundleFile();
    if (!cafile.empty()) {
        curl_easy_setopt(curl, CURLOPT_CAINFO, cafile.c_str());
        return;
    }

    const std::string capath = FindSystemCaDir();
    if (!capath.empty()) {
        curl_easy_setopt(curl, CURLOPT_CAPATH, capath.c_str());
    }
}

static inline size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

SLX9_FORCE_INLINE std::string x43(const std::string& key,
                                            const std::string& device,
                                            const std::string& device_name,
                                            std::string* out_err = nullptr) {
    if (out_err) out_err->clear();

    static std::once_flag curl_once;
    std::call_once(curl_once, []() { curl_global_init(CURL_GLOBAL_DEFAULT); });

    CURL* curl = curl_easy_init();
    if (!curl) {
        if (out_err) *out_err = lit::X113();
        return "";
    }

    x51();

    char errbuf[CURL_ERROR_SIZE];
    errbuf[0] = 0;
    curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, errbuf);

    std::string response;
    std::string body = lit::X114() + JsonEscape(key) +
                       lit::X115() + JsonEscape(device) +
                       lit::X116() + JsonEscape(device_name) + lit::X117();

    std::string ts = std::to_string((long long)std::time(nullptr));
    std::string nonce = GenNonceHex(16);
    std::string body_hash = SHA256Hex(body);
    std::string canonical = ts + "." + nonce + "." + body_hash;
    std::string hmac_key = x45();
    std::string sig = HmacSha256Hex(hmac_key, canonical);
    detail::WipeString(hmac_key);

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, lit::X118().c_str());
    headers = curl_slist_append(headers, lit::X119().c_str());
    headers = curl_slist_append(headers, "Cache-Control: no-store, no-cache, max-age=0");
    headers = curl_slist_append(headers, "Pragma: no-cache");

    std::string h1 = lit::X120() + ts;
    std::string h2 = lit::X121() + nonce;
    std::string h3 = lit::X122() + sig;
    headers = curl_slist_append(headers, h1.c_str());
    headers = curl_slist_append(headers, h2.c_str());
    headers = curl_slist_append(headers, h3.c_str());

    curl_easy_setopt(curl, CURLOPT_URL, S().options.api_url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)body.size());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    std::string ua = lit::X123();
    curl_easy_setopt(curl, CURLOPT_USERAGENT, ua.c_str());
    curl_easy_setopt(curl, CURLOPT_ACCEPT_ENCODING, "");
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
    curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);

#ifdef CURL_IPRESOLVE_V4
    curl_easy_setopt(curl, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
#endif

    auto setup_ssl = [&](bool insecure) {
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, insecure ? 0L : 1L);
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, insecure ? 0L : 2L);
        if (!insecure) ApplyCaToCurl(curl);
    };

    auto do_perform = [&](bool insecure) -> CURLcode {
        response.clear();
        setup_ssl(insecure);
        return curl_easy_perform(curl);
    };

    CURLcode res = do_perform(false);
    long http_code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);

    if (headers) curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        if (out_err) {
            *out_err = lit::X124() + std::to_string((int)res) + " " + std::string(curl_easy_strerror(res));
            if (errbuf[0]) *out_err += " | " + std::string(errbuf);
        }
        return "";
    }

    if (response.empty()) {
        if (out_err) *out_err = http_code ? (lit::X125() + std::to_string(http_code) + lit::X126()) : lit::X127();
        return "";
    }

    if (http_code < 200 || http_code >= 300) {
        if (out_err) *out_err = lit::X128() + std::to_string(http_code);
        return "";
    }
    return response;
}

// ===== login state =====
SLX9_FORCE_INLINE void DisableFeaturesOnLogout() {
    // left intentionally empty: host code can gate features with SunnyLogin::IsLoggedIn()/HasValidAuth().
}

SLX9_FORCE_INLINE void ForceLogout(const std::string& reason) {
    AuthClear();
    S().last_msg = reason;
    DisableFeaturesOnLogout();
}

SLX9_FORCE_INLINE void Logout() {
    AuthClear();
    S().active_key.clear();
    S().active_device.clear();
    S().active_device_name.clear();
    S().lic = LicState{};
    S().remaining_seconds_at_sync = -1;
    S().license_started = false;
    S().license_expires_at.clear();
    S().license_server_time.clear();
    S().last_msg = lit::X129();
    DisableFeaturesOnLogout();
}

SLX9_FORCE_INLINE void x40() {
    std::string key;
    {
        std::lock_guard<std::mutex> lock(S().login_lock);
        key = std::string(S().key_input.data());
        S().last_msg = lit::X130();
    }

    key = ToUpperTrimmed(key);
    if (key.empty()) {
        AuthClear();
        S().login_in_progress = false;
        S().last_msg = lit::X131();
        DisableFeaturesOnLogout();
        return;
    }

    if (!IsValidKeyFormat(key)) {
        AuthClear();
        S().login_in_progress = false;
        S().last_msg = lit::X132();
        DisableFeaturesOnLogout();
        return;
    }

    const std::string device = x62();
    const std::string device_name = x63();

    std::string err;
    const std::string response = x43(key, device, device_name, &err);

    bool ok = false;
    if (response.empty()) {
        if (err.empty()) err = lit::X133();
    } else {
        ok = x44(response, &err);
    }

    if (!ok) AuthClear();
    if (ok) {
        S().license_started = S().lic.started;
        S().license_expires_at = S().lic.expires_at;
        S().license_server_time = S().lic.server_time;
        S().active_key = key;
        S().active_device = device;
        S().active_device_name = device_name;
        AuthAccept(key, device);
        S().next_poll_ms = NowMs() + (uint64_t)S().options.poll_interval_ms;

        if (S().lic.has_remaining) {
            S().remaining_seconds_at_sync = S().lic.remaining_seconds;
        } else {
            S().remaining_seconds_at_sync = -1;
        }

        if (x53()) {
            AuthClear();
            S().last_msg = lit::X134();
            DisableFeaturesOnLogout();
        } else {
            const std::string rem_text = x52();
            S().last_msg = lit::X135() + rem_text;
            if (S().loginui_save_key) {
                S().loginui_saved_key = key;
                x57();
            }
        }
    } else {
        S().last_msg = err.empty() ? lit::X136() : x46(err);
        DisableFeaturesOnLogout();
    }

    S().login_in_progress = false;
    x56();
}

SLX9_FORCE_INLINE void x41() {
    if (S().login_in_progress.exchange(true)) return;
    std::thread([]() { x40(); }).detach();
}

SLX9_FORCE_INLINE void x42() {
    if (S().poll_inflight.exchange(true)) return;

    const std::string key = S().active_key;
    const std::string dev = S().active_device;
    const std::string dname = S().active_device_name;

    std::thread([key, dev, dname]() {
        std::string err;
        const std::string resp = x43(key, dev, dname, &err);
        bool ok = false;
        std::string parse_err;
        if (!resp.empty()) ok = x44(resp, &parse_err);

        if (!ok) {
            // Fail-closed: if the server cannot positively renew the lease, stop the session.
            ForceLogout(lit::X137());
        } else {
            AuthAccept(key, dev);
        }
        S().poll_inflight.store(false);
    }).detach();
}

SLX9_FORCE_INLINE void x54() {
    if (!AuthLooksValid()) return;
    const uint64_t now = NowMs();
    if (now < S().next_poll_ms) return;
    S().next_poll_ms = now + (uint64_t)S().options.poll_interval_ms;
    x42();
}

SLX9_FORCE_INLINE void Tick() {
    x55();
    x56();

    if (AuthLooksValid()) {
        std::string reason;
        if (x53(&reason)) {
            ForceLogout(reason);
        } else {
            x54();
        }
    }

    if (!AuthLooksValid() && S().loginui_auto_key && !S().loginui_auto_login_triggered) {
        const std::string key = ToUpperTrimmed(std::string(S().key_input.data()));
        if (!key.empty() && IsValidKeyFormat(key)) {
            S().loginui_auto_login_triggered = true;
            x41();
        }
    }
}

// ===== hide 9 taps, isolated =====
class Hide9Controller {
public:
    bool IsHidden() const { return hidden_; }
    void SetHidden(bool v) {
        hidden_ = v;
        tap_count_ = 0;
        last_tap_time_ = std::chrono::steady_clock::now();
    }

    template <typename RenderNowFn>
    bool ConsumeFrameIfHidden(RenderNowFn&& render_now) {
        if (!AuthLooksValid() || !hidden_) return false;

        if (ImGui::GetIO().MouseClicked[0]) {
            auto now = std::chrono::steady_clock::now();
            auto delta = std::chrono::duration_cast<std::chrono::milliseconds>(now - last_tap_time_).count();

            if (delta > 350) tap_count_ = 1;
            else ++tap_count_;

            last_tap_time_ = now;

            if (tap_count_ >= 9) {
                hidden_ = false;
                tap_count_ = 0;
                return false;
            }
        }

        render_now();
        return true;
    }

private:
    bool hidden_ = false;
    int tap_count_ = 0;
    std::chrono::steady_clock::time_point last_tap_time_ = std::chrono::steady_clock::now();
};

static inline Hide9Controller& Hide9() {
    static Hide9Controller h;
    return h;
}

// ===== UI helpers =====
static inline ImVec4 HSVtoRGB(float h, float s, float v, float a = 1.0f) {
    float r, g, b;
    ImGui::ColorConvertHSVtoRGB(h, s, v, r, g, b);
    return ImVec4(r, g, b, a);
}

static inline void DrawEyeIcon(ImDrawList* dl, const ImVec2& a, const ImVec2& b, ImU32 col, bool opened) {
    if (!dl) return;
    const ImVec2 c((a.x + b.x) * 0.5f, (a.y + b.y) * 0.5f);
    const float rx = (b.x - a.x) * 0.35f;
    const float ry = (b.y - a.y) * 0.22f;

    dl->AddBezierCubic(
        ImVec2(c.x - rx, c.y),
        ImVec2(c.x - rx * 0.4f, c.y - ry),
        ImVec2(c.x + rx * 0.4f, c.y - ry),
        ImVec2(c.x + rx, c.y),
        col, 2.0f
    );
    dl->AddBezierCubic(
        ImVec2(c.x - rx, c.y),
        ImVec2(c.x - rx * 0.4f, c.y + ry),
        ImVec2(c.x + rx * 0.4f, c.y + ry),
        ImVec2(c.x + rx, c.y),
        col, 2.0f
    );

    if (opened) {
        dl->AddCircleFilled(c, std::min(rx, ry) * 0.45f, col, 16);
    } else {
        dl->AddLine(ImVec2(c.x - rx * 0.9f, c.y + ry * 0.9f), ImVec2(c.x + rx * 0.9f, c.y - ry * 0.9f), col, 2.0f);
    }
}

static inline void DrawRainbowWindowDecor(const ImVec2& pos, const ImVec2& size, float rounding) {
    ImDrawList* dl = ImGui::GetWindowDrawList();
    if (!dl) return;

    dl->AddRectFilled(pos, ImVec2(pos.x + size.x, pos.y + size.y), IM_COL32(11, 13, 20, 235), rounding);

    const float t = (float)(NowMs() % 6000ull) / 6000.0f;
    const ImVec4 c1 = HSVtoRGB(std::fmod(t + 0.00f, 1.0f), 0.75f, 1.00f);
    const ImVec4 c2 = HSVtoRGB(std::fmod(t + 0.18f, 1.0f), 0.75f, 1.00f);
    const ImVec4 c3 = HSVtoRGB(std::fmod(t + 0.36f, 1.0f), 0.75f, 1.00f);
    const ImVec4 c4 = HSVtoRGB(std::fmod(t + 0.54f, 1.0f), 0.75f, 1.00f);

    dl->AddRectFilledMultiColor(
        pos, ImVec2(pos.x + size.x, pos.y + 5.0f),
        ImGui::ColorConvertFloat4ToU32(c1),
        ImGui::ColorConvertFloat4ToU32(c2),
        ImGui::ColorConvertFloat4ToU32(c3),
        ImGui::ColorConvertFloat4ToU32(c4)
    );

    dl->AddRect(pos, ImVec2(pos.x + size.x, pos.y + size.y), IM_COL32(255, 255, 255, 24), rounding, 0, 1.0f);
}

static inline bool BigToggle(const char* id, bool* v, ImVec2 switch_size = ImVec2(46, 24)) {
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    if (window->SkipItems) return false;

    ImGuiID toggle_id = window->GetID(id);
    ImVec2 pos = window->DC.CursorPos;
    ImRect bb(pos, ImVec2(pos.x + switch_size.x, pos.y + switch_size.y));
    ImGui::ItemSize(bb);
    if (!ImGui::ItemAdd(bb, toggle_id)) return false;

    bool hovered, held;
    bool pressed = ImGui::ButtonBehavior(bb, toggle_id, &hovered, &held);
    if (pressed) *v = !*v;

    ImU32 bg = *v ? IM_COL32(73, 196, 112, 255) : IM_COL32(82, 84, 95, 255);
    if (hovered) bg = *v ? IM_COL32(82, 212, 122, 255) : IM_COL32(95, 98, 110, 255);

    ImDrawList* dl = ImGui::GetWindowDrawList();
    dl->AddRectFilled(bb.Min, bb.Max, bg, switch_size.y * 0.5f);
    float knob_r = switch_size.y * 0.5f - 2.0f;
    float knob_x = *v ? (bb.Max.x - knob_r - 2.0f) : (bb.Min.x + knob_r + 2.0f);
    dl->AddCircleFilled(ImVec2(knob_x, (bb.Min.y + bb.Max.y) * 0.5f), knob_r, IM_COL32(255, 255, 255, 255), 24);
    return pressed;
}

static inline void SectionTitle(const char* txt) {
    ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(245, 245, 255, 235));
    ImGui::TextUnformatted(txt);
    ImGui::PopStyleColor();
}

static inline void DrawStatusBox(const std::string& status) {
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ImVec2 p = ImGui::GetCursorScreenPos();
    ImVec2 avail = ImGui::GetContentRegionAvail();
    float h = 64.0f;

    dl->AddRectFilled(p, ImVec2(p.x + avail.x, p.y + h), IM_COL32(0, 0, 0, 120), 12.0f);
    ImGui::Dummy(ImVec2(0, 10.0f));
    ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(255, 255, 255, 235));
    std::string ready = lit::X138();
    ImGui::TextWrapped("%s", status.empty() ? ready.c_str() : status.c_str());
    ImGui::PopStyleColor();
    ImGui::Dummy(ImVec2(0, 16.0f));
}

static inline void DrawQuickLinks() {
    const float btn_h = 34.0f;
    if (ImGui::Button("Get Key", ImVec2(-1, btn_h))) RequestOpenUrl(LINK_GET_KEY);
    if (ImGui::Button("YouTube", ImVec2(-1, btn_h))) RequestOpenUrl(LINK_YOUTUBE);
    if (ImGui::Button("Box Zalo", ImVec2(-1, btn_h))) RequestOpenUrl(LINK_ZALO);
    if (ImGui::Button("Telegram", ImVec2(-1, btn_h))) RequestOpenUrl(LINK_TELEGRAM);
    // if (ImGui::Button(lit::X143().c_str(), ImVec2(-1, btn_h))) RequestOpenUrl(LINK_TELEGRAM);
}

static inline void DrawLicenseHUD() {
    if (!S().options.show_license_hud || !AuthLooksValid()) return;

    ImGui::SetNextWindowBgAlpha(0.35f);
    ImGui::SetNextWindowPos(ImVec2(20.0f, 20.0f), ImGuiCond_Always);

    ImGuiWindowFlags flags =
        ImGuiWindowFlags_NoTitleBar |
        ImGuiWindowFlags_AlwaysAutoResize |
        ImGuiWindowFlags_NoMove |
        ImGuiWindowFlags_NoSavedSettings |
        ImGuiWindowFlags_NoFocusOnAppearing |
        ImGuiWindowFlags_NoNav;

    if (ImGui::Begin(lit::X144().c_str(), nullptr, flags)) {
        std::string display_key = S().active_key;
        if (!S().show_info_key && !display_key.empty()) display_key = lit::X145();
        if (display_key.empty()) display_key = lit::X101();

        ImGui::Text(lit::X146().c_str(), display_key.c_str());
        ImGui::SameLine(0.0f, 10.0f);

        ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0, 0, 0, 0));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(1, 1, 1, 0.08f));
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, ImVec4(1, 1, 1, 0.16f));
        if (ImGui::Button(lit::X147().c_str(), ImVec2(34, 22))) {
            S().show_info_key = !S().show_info_key;
        }
        DrawEyeIcon(ImGui::GetWindowDrawList(), ImGui::GetItemRectMin(), ImGui::GetItemRectMax(), IM_COL32(255, 255, 255, 220), S().show_info_key);
        ImGui::PopStyleColor(3);

        ImGui::Text(lit::X148().c_str(), x52().c_str());
    }
    ImGui::End();
}

static inline void DrawLoginWindow() {
    x55();

    ImGuiIO& io = ImGui::GetIO();
    const float screenW = io.DisplaySize.x;
    const float screenH = io.DisplaySize.y;

    float winW = std::max(520.0f, screenW * 0.56f);
    float winH = std::max(455.0f, screenH * 0.56f);

    const float maxW = std::max(360.0f, screenW - 26.0f);
    const float maxH = std::max(360.0f, screenH - 26.0f);
    if (winW > maxW) winW = maxW;
    if (winH > maxH) winH = maxH;

    ImGui::SetNextWindowPos(ImVec2(screenW * 0.5f, screenH * 0.5f), ImGuiCond_Always, ImVec2(0.5f, 0.5f));
    ImGui::SetNextWindowSize(ImVec2(winW, winH), ImGuiCond_Always);
    ImGui::SetNextWindowBgAlpha(0.0f);

    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 16.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 13.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(18, 16));
    ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(10, 10));
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(12, 11));

    ImGuiWindowFlags flags =
        ImGuiWindowFlags_NoResize |
        ImGuiWindowFlags_NoCollapse |
        ImGuiWindowFlags_NoSavedSettings |
        ImGuiWindowFlags_NoScrollbar |
        ImGuiWindowFlags_NoScrollWithMouse |
        ImGuiWindowFlags_NoTitleBar;

    if (ImGui::Begin(lit::X149().c_str(), nullptr, flags)) {
        const ImVec2 wp = ImGui::GetWindowPos();
        const ImVec2 ws = ImGui::GetWindowSize();
        ImDrawList* dl = ImGui::GetWindowDrawList();
        DrawRainbowWindowDecor(wp, ws, 16.0f);

        // Header
        ImGui::Dummy(ImVec2(0, 2));
        ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(255, 255, 255, 245));
        ImGui::SetWindowFontScale(1.20f);
       // ImGui::TextUnformatted(lit::X150().c_str());
        ImGui::TextUnformatted("Sunny Mod");
        ImGui::SetWindowFontScale(1.0f);
        ImGui::PopStyleColor();

        ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(196, 204, 222, 220));
        ImGui::TextUnformatted("Secure login center");
        ImGui::PopStyleColor();

        ImGui::Dummy(ImVec2(0, 2));
        dl->AddLine(ImVec2(wp.x + 18.0f, ImGui::GetCursorScreenPos().y), ImVec2(wp.x + ws.x - 18.0f, ImGui::GetCursorScreenPos().y), IM_COL32(255,255,255,28), 1.0f);
        ImGui::Dummy(ImVec2(0, 10));

        // Key section
        ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(240, 244, 255, 235));
        ImGui::TextUnformatted(lit::X152().c_str());
        ImGui::PopStyleColor();

        ImGui::PushItemWidth(-1.0f);
        bool keyEdited = ImGui::InputTextWithHint(lit::X153().c_str(), lit::X154().c_str(), S().key_input.data(), S().key_input.size());
        ImGui::PopItemWidth();
        if (keyEdited) {
            std::string normalized = ToUpperTrimmed(std::string(S().key_input.data()));
            std::snprintf(S().key_input.data(), S().key_input.size(), "%s", normalized.c_str());
            if (S().loginui_save_key) x57();
        }

        const float availW = ImGui::GetContentRegionAvail().x;
        const float btnH = 38.0f;
        const float smallW = 120.0f;
        const float gap = ImGui::GetStyle().ItemSpacing.x;
        float getKeyW = availW - smallW - smallW - gap * 2.0f;
        if (getKeyW < 150.0f) getKeyW = 150.0f;

        ImGui::PushStyleColor(ImGuiCol_Button, IM_COL32(28, 56, 110, 220));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(38, 72, 132, 235));
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, IM_COL32(23, 49, 96, 255));
        if (ImGui::Button(lit::X155().c_str(), ImVec2(smallW, btnH))) {
            std::string clip = ToUpperTrimmed(GetClipboardSafe());
            if (!clip.empty()) {
                std::snprintf(S().key_input.data(), S().key_input.size(), "%s", clip.c_str());
                S().last_msg = lit::X156();
                if (S().loginui_save_key) x57();
            } else {
                S().last_msg = lit::X157();
            }
        }
        ImGui::SameLine();
        if (ImGui::Button(lit::X158().c_str(), ImVec2(smallW, btnH))) {
            S().key_input[0] = '\0';
            S().last_msg = lit::X159();
            x57(true);
        }
        ImGui::PopStyleColor(3);

        ImGui::SameLine();
        ImGui::PushStyleColor(ImGuiCol_Button, IM_COL32(71, 98, 220, 235));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(85, 116, 236, 245));
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, IM_COL32(56, 84, 195, 255));
        if (ImGui::Button("Get Key", ImVec2(-1, btnH))) {
            RequestOpenUrl(LINK_GET_KEY);
        }
        ImGui::PopStyleColor(3);

        ImGui::Dummy(ImVec2(0, 4));

        // Options + MSG
        const float leftW = ImGui::GetContentRegionAvail().x * 0.44f;
        const float rightW = ImGui::GetContentRegionAvail().x - leftW - 10.0f;

        ImGui::BeginChild(lit::X160().c_str(), ImVec2(leftW, 118.0f), false, ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
        {
            const ImVec2 cpos = ImGui::GetWindowPos();
            const ImVec2 csize = ImGui::GetWindowSize();
            dl->AddRectFilled(cpos, ImVec2(cpos.x + csize.x, cpos.y + csize.y), IM_COL32(255,255,255,8), 12.0f);
            dl->AddRect(cpos, ImVec2(cpos.x + csize.x, cpos.y + csize.y), IM_COL32(255,255,255,20), 12.0f, 0, 1.0f);

            ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(240,244,255,235));
            ImGui::TextUnformatted(lit::X161().c_str());
            ImGui::PopStyleColor();
            ImGui::Dummy(ImVec2(0, 4));

            if (BigToggle(lit::X162().c_str(), &S().loginui_save_key, ImVec2(44, 22))) {
                if (!S().loginui_save_key) {
                    S().loginui_saved_key.clear();
                    S().last_msg = lit::X163();
                    x57(true);
                } else {
                    S().loginui_saved_key = ToUpperTrimmed(std::string(S().key_input.data()));
                    S().last_msg = lit::X164();
                    x57();
                }
            }
            ImGui::SameLine();
            ImGui::TextUnformatted(lit::X165().c_str());

            ImGui::Dummy(ImVec2(0, 6));
            if (BigToggle(lit::X166().c_str(), &S().loginui_auto_key, ImVec2(44, 22))) {
                S().last_msg = S().loginui_auto_key ? lit::X167() : lit::X168();
                x57();
            }
            ImGui::SameLine();
            ImGui::TextUnformatted(lit::X169().c_str());
        }
        ImGui::EndChild();

        ImGui::SameLine();
        ImGui::BeginChild(lit::X170().c_str(), ImVec2(0, 118.0f), false, ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
        {
            const ImVec2 cpos = ImGui::GetWindowPos();
            const ImVec2 csize = ImGui::GetWindowSize();
            dl->AddRectFilled(cpos, ImVec2(cpos.x + csize.x, cpos.y + csize.y), IM_COL32(0,0,0,80), 12.0f);
            dl->AddRect(cpos, ImVec2(cpos.x + csize.x, cpos.y + csize.y), IM_COL32(255,255,255,18), 12.0f, 0, 1.0f);

            ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(96, 176, 255, 240));
            ImGui::TextUnformatted(lit::X171().c_str());
            ImGui::PopStyleColor();
            ImGui::Dummy(ImVec2(0, 4));

            std::string msg = S().last_msg.empty() ? lit::X172() : S().last_msg;
            ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(235,239,248,236));
            ImGui::TextWrapped("%s", msg.c_str());
            ImGui::PopStyleColor();

            ImGui::Dummy(ImVec2(0, 6));
            ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(173, 185, 208, 205));
            ImGui::TextUnformatted(lit::X173().c_str());
            ImGui::TextUnformatted(lit::X174().c_str());
            ImGui::TextUnformatted(lit::X175().c_str());
            ImGui::PopStyleColor();
        }
        ImGui::EndChild();

        ImGui::Dummy(ImVec2(0, 8));

        const bool can_login = !S().login_in_progress.load();
        if (!can_login) ImGui::BeginDisabled();
        ImGui::PushStyleColor(ImGuiCol_Button, IM_COL32(69, 102, 228, 240));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(84, 118, 242, 248));
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, IM_COL32(55, 86, 204, 255));
        std::string login_btn_text = S().login_in_progress ? lit::X176() : lit::X177();
        if (ImGui::Button(login_btn_text.c_str(), ImVec2(-1, 46))) {
            if (S().loginui_save_key) {
                S().loginui_saved_key = ToUpperTrimmed(std::string(S().key_input.data()));
                S().loginui_pending_save = true;
            }
            x41();
        }
        ImGui::PopStyleColor(3);
        if (!can_login) ImGui::EndDisabled();

        ImGui::Dummy(ImVec2(0, 8));
        ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(192, 199, 216, 220));
        ImGui::TextUnformatted(lit::X178().c_str());
        ImGui::PopStyleColor();

        const float linkW = (ImGui::GetContentRegionAvail().x - gap * 2.0f) / 3.0f;
        ImGui::PushStyleColor(ImGuiCol_Button, IM_COL32(24, 32, 56, 220));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, IM_COL32(32, 44, 74, 236));
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, IM_COL32(21, 29, 50, 255));
        if (ImGui::Button("YouTube", ImVec2(linkW, 34.0f))) RequestOpenUrl(LINK_YOUTUBE);
        ImGui::SameLine();
        if (ImGui::Button("Box Zalo", ImVec2(linkW, 34.0f))) RequestOpenUrl(LINK_ZALO);
        ImGui::SameLine();
        if (ImGui::Button("Telegram", ImVec2(-1, 34.0f))) RequestOpenUrl(LINK_TELEGRAM);
        ImGui::PopStyleColor(3);
    }
    ImGui::End();
    ImGui::PopStyleVar(5);
}

static inline void Draw() {
    if (!AuthLooksValid()) DrawLoginWindow();
    else DrawLicenseHUD();

    FlushPendingOpenUrl();
}

// ===== public api =====
SLX9_FORCE_INLINE void SetUnityOpenUrlCallbacks(UnityCreateStringFn create_string_fn, UnityOpenUrlFn open_url_fn) {
    S().unity_create_string = create_string_fn;
    S().unity_open_url = open_url_fn;
}

SLX9_FORCE_INLINE void InitJavaVM(
#ifdef __ANDROID__
    JavaVM* vm
#else
    void* vm = nullptr
#endif
) {
#ifdef __ANDROID__
    S().jvm = vm;
#else
    (void)vm;
#endif
    x55();
}

#ifdef __ANDROID__
SLX9_FORCE_INLINE void SetActivity(JNIEnv* env, jobject activity) {
    if (!env || !activity) return;
    if (S().activity) {
        env->DeleteGlobalRef(S().activity);
        S().activity = nullptr;
    }
    S().activity = env->NewGlobalRef(activity);
}
#endif

SLX9_FORCE_INLINE void SetOptions(const Options& opt) {
    S().options = opt;
}

SLX9_FORCE_INLINE void SetLicenseHudVisible(bool visible) {
    S().options.show_license_hud = visible;
}

SLX9_FORCE_INLINE bool IsLicenseHudVisible() {
    return S().options.show_license_hud;
}

SLX9_FORCE_INLINE const Options& GetOptions() {
    return S().options;
}

SLX9_FORCE_INLINE bool HasValidAuth() {
    return AuthLooksValid();
}

SLX9_FORCE_INLINE bool HasFeature(uint32_t required_flags = AUTH_FLAG_REMOTE_OK) {
    if (!AuthLooksValid()) return false;
    return (S().auth_flags & required_flags) == required_flags;
}

SLX9_FORCE_INLINE bool IsLoggedIn() {
    return AuthLooksValid();
}

SLX9_FORCE_INLINE const std::string& StatusText() {
    return S().last_msg;
}

SLX9_FORCE_INLINE const std::string& ActiveKey() {
    return S().active_key;
}

SLX9_FORCE_INLINE LicState GetLicenseState() {
    return S().lic;
}

} // namespace SLX9

namespace SunnyLogin = SLX9;
