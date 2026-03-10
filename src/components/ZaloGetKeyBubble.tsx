import React, { useEffect, useRef, useState } from "react";

const ZALO_URL = "https://zalo.me/84373752504";

type Pos = { x: number; y: number };

export default function ZaloGetKeyBubble() {
  const [hidden, setHidden] = useState(false);
  const [pos, setPos] = useState<Pos>({ x: 20, y: 420 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });

  useEffect(() => {
    setHidden(false);
  }, []);

  const clamp = (x: number, y: number) => {
    const maxX = Math.max(12, window.innerWidth - 170);
    const maxY = Math.max(12, window.innerHeight - 90);
    return {
      x: Math.min(Math.max(12, x), maxX),
      y: Math.min(Math.max(12, y), maxY),
    };
  };

  const onStart = (clientX: number, clientY: number) => {
    dragRef.current = {
      active: true,
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
    setPos(clamp(dragRef.current.baseX + dx, dragRef.current.baseY + dy));
  };

  const onEnd = () => {
    dragRef.current.active = false;
    setTimeout(() => setDragging(false), 40);
  };

  useEffect(() => {
    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const mu = () => onEnd();
    const tm = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const tu = () => onEnd();

    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("touchmove", tm, { passive: true });
    window.addEventListener("touchend", tu);

    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", tu);
    };
  }, [pos.x, pos.y]);

  if (hidden) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        userSelect: "none",
        WebkitUserSelect: "none",
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
          background: "rgba(10,20,45,0.92)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: dragging
            ? "0 0 0 2px rgba(59,130,246,0.35), 0 16px 36px rgba(0,0,0,0.35)"
            : "0 12px 28px rgba(0,0,0,0.32)",
          backdropFilter: "blur(10px)",
          cursor: dragging ? "grabbing" : "grab",
          minWidth: 160,
        }}
      >
        <a
          href={ZALO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (dragging) e.preventDefault();
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
              background:
                "radial-gradient(circle at 30% 30%, #60a5fa, #2563eb 55%, #1d4ed8)",
              boxShadow: "0 0 18px rgba(37,99,235,0.45)",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: 0.5,
            }}
          >
            Zalo
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Liên Hệ Admin</div>
            <div style={{ fontSize: 11, opacity: 0.72 }}>Kéo để di chuyển</div>
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
}
