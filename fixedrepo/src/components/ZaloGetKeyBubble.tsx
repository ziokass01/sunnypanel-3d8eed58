import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ZALO_URL = "https://zalo.me/84373752504";

type Pos = { x: number; y: number };

export default function ZaloGetKeyBubble() {
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<Pos>(() => ({
    x: Math.max(12, (typeof window !== "undefined" ? window.innerWidth : 360) - 190),
    y: Math.max(140, (typeof window !== "undefined" ? window.innerHeight : 720) - 140),
  }));

  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });

  useEffect(() => {
    setMounted(true);
    setHidden(false);
  }, []);

  const clamp = (x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    const maxX = Math.max(12, window.innerWidth - 180);
    const maxY = Math.max(12, window.innerHeight - 80);
    return {
      x: Math.min(Math.max(12, x), maxX),
      y: Math.min(Math.max(12, y), maxY),
    };
  };

  useEffect(() => {
    const onResize = () => setPos((prev) => clamp(prev.x, prev.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onStart = (clientX: number, clientY: number) => {
    dragRef.current = {
      active: true,
      moved: false,
      startX: clientX,
      startY: clientY,
      baseX: pos.x,
      baseY: pos.y,
    };
    setDragging(true);
  };

  const onMove = (clientX: number, clientY: number) => {
    if (!dragRef.current.active) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
    setPos(clamp(dragRef.current.baseX + dx, dragRef.current.baseY + dy));
  };

  const onEnd = () => {
    dragRef.current.active = false;
    window.setTimeout(() => setDragging(false), 40);
  };

  useEffect(() => {
    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const mu = () => onEnd();
    const tm = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      onMove(t.clientX, t.clientY);
    };
    const tu = () => onEnd();

    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("touchmove", tm, { passive: true });
    window.addEventListener("touchend", tu);
    window.addEventListener("touchcancel", tu);

    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", tu);
      window.removeEventListener("touchcancel", tu);
    };
  }, [pos.x, pos.y]);

  const bubble = useMemo(() => {
    if (hidden) return null;
    return (
      <div
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 2147483647,
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "none",
        }}
      >
        <div
          onMouseDown={(e) => onStart(e.clientX, e.clientY)}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) onStart(t.clientX, t.clientY);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px 10px 10px",
            borderRadius: 999,
            background: "rgba(8, 18, 45, 0.94)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: dragging
              ? "0 0 0 2px rgba(59,130,246,0.34), 0 18px 42px rgba(0,0,0,0.36)"
              : "0 14px 36px rgba(0,0,0,0.34)",
            backdropFilter: "blur(12px)",
            cursor: dragging ? "grabbing" : "grab",
            minWidth: 178,
          }}
        >
          <a
            href={ZALO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (dragRef.current.moved) e.preventDefault();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "#fff",
              flex: 1,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "radial-gradient(circle at 30% 30%, #7dd3fc, #2563eb 55%, #1d4ed8)",
                boxShadow: "0 0 20px rgba(37,99,235,0.55)",
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: 0.2,
              }}
            >
              Zalo
            </div>
            <div style={{ lineHeight: 1.12 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Liên Hệ Admin</div>
              <div style={{ fontSize: 11, opacity: 0.74 }}>Kéo để di chuyển</div>
            </div>
          </a>

          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label="Ẩn"
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }, [dragging, hidden, pos.x, pos.y]);

  if (!mounted || !bubble || typeof document === "undefined") return null;
  return createPortal(bubble, document.body);
}
