import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useSupport } from "@/features/support/config";
import { SupportLinks } from "@/features/support/SupportViews";

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
  const { config } = useSupport();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [showNotice, setShowNotice] = useState(() => typeof window !== "undefined" && window.innerWidth >= 640);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<Pos>(() =>
    clampPosition(
      (typeof window !== "undefined" ? window.innerWidth : 360) - 82,
      (typeof window !== "undefined" ? window.innerHeight : 720) - 118,
    ),
  );

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
    const onResize = () => {
      if (window.innerWidth < 100 || window.innerHeight < 100) return;
      setPos((current) => clampPosition(current.x, current.y));
    };
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

  if (
    !mounted ||
    !config.bubble_enabled ||
    !config.links.some((l) => l.enabled) ||
    typeof document === "undefined"
  )
    return null;

  const alignRight = pos.x > window.innerWidth / 2;
  const popupWidth = Math.min(320, window.innerWidth - 24);
  const positionPopup = (width: number) => ({
    left:
      Math.max(
        12,
        Math.min(
          alignRight ? pos.x + 64 - width : pos.x,
          window.innerWidth - width - 12,
        ),
      ) - pos.x,
  });

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 40,
        width: 64,
        height: 64,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {showNotice && config.notice && !open ? (
        <div
          role="status"
          style={{
            position: "absolute",
            bottom: pos.y > window.innerHeight / 2 ? 76 : undefined,
            top: pos.y > window.innerHeight / 2 ? undefined : 76,
            width: Math.min(250, window.innerWidth - 24),
            padding: "11px 13px",
            borderRadius: 16,
            color: "#f8fafc",
            background: "rgba(15, 23, 42, 0.96)",
            border: "1px solid rgba(148, 163, 184, 0.28)",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.32)",
            fontSize: 13,
            fontWeight: 650,
            lineHeight: 1.35,
            ...positionPopup(Math.min(250, window.innerWidth - 24)),
          }}
        >
          {config.notice}
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
            bottom: pos.y > window.innerHeight / 2 ? 76 : undefined,
            top: pos.y > window.innerHeight / 2 ? undefined : 76,
            width: popupWidth,
            maxHeight: Math.max(
              80,
              pos.y > window.innerHeight / 2
                ? pos.y - 88
                : window.innerHeight - pos.y - 88,
            ),
            overflowY: "auto",
            padding: 12,
            borderRadius: 20,
            background: "rgba(255, 255, 255, 0.98)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            boxShadow: "0 20px 48px rgba(15, 23, 42, 0.24)",
            backdropFilter: "blur(14px)",
            ...positionPopup(popupWidth),
          }}
        >
          <div
            style={{
              padding: "2px 4px 10px",
              color: "#0f172a",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {config.title}
          </div>

          <SupportLinks config={config} />
        </div>
      ) : null}

      <button
        type="button"
        aria-label={open ? "Đóng liên hệ" : "Mở liên hệ SunnyMod"}
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
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 18.5 3.8 21l3.4-1.2c1.4.8 3 1.2 4.8 1.2 5 0 9-3.6 9-8s-4-8-9-8-9 3.6-9 8c0 2.1.8 4 2 5.5Z"
            fill="currentColor"
            opacity=".98"
          />
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
