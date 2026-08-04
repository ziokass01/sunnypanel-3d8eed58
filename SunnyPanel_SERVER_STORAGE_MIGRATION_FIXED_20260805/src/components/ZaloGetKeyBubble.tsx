import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ZALO_URL = "https://zalo.me/84373752504";
const TELEGRAM_URL = "https://t.me/SunnyModCommunity";
const TELEGRAM_NOTICE = "Tham gia vào nhóm để biết thêm thông tin mới nhất";

type Pos = { x: number; y: number };

function clampPosition(x: number, y: number) {
  if (typeof window === "undefined") return { x, y };
  const size = 64;
  return {
    x: Math.min(Math.max(12, x), Math.max(12, window.innerWidth - size - 12)),
    y: Math.min(Math.max(12, y), Math.max(12, window.innerHeight - size - 18)),
  };
}

export default function ZaloGetKeyBubble() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [showNotice, setShowNotice] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<Pos>(() => clampPosition(
    (typeof window !== "undefined" ? window.innerWidth : 360) - 82,
    (typeof window !== "undefined" ? window.innerHeight : 720) - 118,
  ));

  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });

  useEffect(() => {
    setMounted(true);
    const noticeTimer = window.setTimeout(() => setShowNotice(false), 9000);
    return () => window.clearTimeout(noticeTimer);
  }, []);

  useEffect(() => {
    const onResize = () => setPos((current) => clampPosition(current.x, current.y));
    const onPointerMove = (event: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = event.clientX - drag.current.startX;
      const dy = event.clientY - drag.current.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.current.moved = true;
      setPos(clampPosition(drag.current.baseX + dx, drag.current.baseY + dy));
    };
    const onPointerUp = () => {
      drag.current.active = false;
      window.setTimeout(() => setDragging(false), 40);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      baseX: pos.x,
      baseY: pos.y,
    };
    setDragging(true);
  };

  const toggleMenu = () => {
    if (drag.current.moved) return;
    setOpen((current) => !current);
    setShowNotice(false);
  };

  if (!mounted || typeof document === "undefined") return null;

  const alignRight = pos.x > window.innerWidth / 2;
  const popupSideStyle = alignRight ? { right: 0 } : { left: 0 };

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 2147483647,
        width: 64,
        height: 64,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {showNotice && !open ? (
        <div
          role="status"
          style={{
            position: "absolute",
            bottom: 76,
            width: 250,
            padding: "11px 13px",
            borderRadius: 16,
            color: "#f8fafc",
            background: "rgba(15, 23, 42, 0.96)",
            border: "1px solid rgba(148, 163, 184, 0.28)",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.32)",
            fontSize: 13,
            fontWeight: 650,
            lineHeight: 1.35,
            ...popupSideStyle,
          }}
        >
          {TELEGRAM_NOTICE}
          <span
            style={{
              position: "absolute",
              bottom: -7,
              width: 14,
              height: 14,
              background: "rgba(15, 23, 42, 0.96)",
              transform: "rotate(45deg)",
              right: alignRight ? 24 : undefined,
              left: alignRight ? undefined : 24,
            }}
          />
        </div>
      ) : null}

      {open ? (
        <div
          style={{
            position: "absolute",
            bottom: 76,
            width: 286,
            padding: 12,
            borderRadius: 20,
            background: "rgba(255, 255, 255, 0.98)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            boxShadow: "0 20px 48px rgba(15, 23, 42, 0.24)",
            backdropFilter: "blur(14px)",
            ...popupSideStyle,
          }}
        >
          <div style={{ padding: "2px 4px 10px", color: "#0f172a", fontSize: 14, fontWeight: 800 }}>
            Kết nối với SunnyMod
          </div>

          <a
            href={ZALO_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: 10,
              borderRadius: 15,
              color: "#0f172a",
              textDecoration: "none",
              background: "#eff6ff",
              border: "1px solid #dbeafe",
            }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 43,
                height: 43,
                flexShrink: 0,
                borderRadius: "50%",
                color: "white",
                background: "linear-gradient(145deg, #60a5fa, #2563eb)",
                fontSize: 13,
                fontWeight: 850,
                boxShadow: "0 7px 18px rgba(37, 99, 235, 0.30)",
              }}
            >
              Zalo
            </span>
            <span style={{ lineHeight: 1.25 }}>
              <strong style={{ display: "block", fontSize: 14 }}>Liên hệ Admin</strong>
              <span style={{ color: "#64748b", fontSize: 12 }}>Hỗ trợ trực tiếp qua Zalo</span>
            </span>
          </a>

          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              marginTop: 8,
              padding: 10,
              borderRadius: 15,
              color: "#0f172a",
              textDecoration: "none",
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
            }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 43,
                height: 43,
                flexShrink: 0,
                borderRadius: "50%",
                color: "white",
                background: "linear-gradient(145deg, #38bdf8, #0284c7)",
                boxShadow: "0 7px 18px rgba(2, 132, 199, 0.30)",
              }}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21.4 3.6 18.2 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.8 12.8 1 11.3c-1-.3-1.1-1 .2-1.5L20 2.6c.9-.3 1.6.2 1.4 1Z" fill="currentColor" />
              </svg>
            </span>
            <span style={{ lineHeight: 1.25 }}>
              <strong style={{ display: "block", fontSize: 14 }}>Telegram</strong>
              <span style={{ color: "#64748b", fontSize: 12 }}>{TELEGRAM_NOTICE}</span>
            </span>
          </a>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={open ? "Đóng liên hệ" : "Mở Zalo và Telegram"}
        aria-expanded={open}
        onPointerDown={startDrag}
        onClick={toggleMenu}
        style={{
          position: "relative",
          display: "grid",
          placeItems: "center",
          width: 64,
          height: 64,
          padding: 0,
          borderRadius: "50%",
          border: "5px solid rgba(186, 230, 253, 0.88)",
          color: "white",
          background: "linear-gradient(145deg, #0ea5e9, #1d4ed8)",
          boxShadow: dragging
            ? "0 0 0 5px rgba(56, 189, 248, 0.22), 0 16px 34px rgba(15, 23, 42, 0.28)"
            : "0 0 0 3px rgba(14, 165, 233, 0.16), 0 14px 32px rgba(15, 23, 42, 0.26)",
          cursor: dragging ? "grabbing" : "pointer",
          touchAction: "none",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 18.5 3.8 21l3.4-1.2c1.4.8 3 1.2 4.8 1.2 5 0 9-3.6 9-8s-4-8-9-8-9 3.6-9 8c0 2.1.8 4 2 5.5Z" fill="currentColor" opacity=".98" />
          <circle cx="8" cy="13" r="1.1" fill="#2563eb" />
          <circle cx="12" cy="13" r="1.1" fill="#2563eb" />
          <circle cx="16" cy="13" r="1.1" fill="#2563eb" />
        </svg>
        <span
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: "#22c55e",
            border: "2px solid white",
            boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.16)",
          }}
        />
      </button>
    </div>,
    document.body,
  );
}
