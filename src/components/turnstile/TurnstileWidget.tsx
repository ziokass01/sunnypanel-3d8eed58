import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        theme?: "light" | "dark" | "auto";
        size?: "normal" | "flexible" | "compact";
        appearance?: "always" | "execute" | "interaction-only";
        retry?: "auto" | "never";
        language?: string;
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "timeout-callback"?: () => void;
        "unsupported-callback"?: () => void;
        "error-callback"?: (errorCode?: string | number) => boolean | void;
      }) => string;
      remove?: (widgetId: string) => void;
      reset?: (widgetId?: string) => void;
    };
  }
}

type Props = {
  siteKey?: string;
  onTokenChange: (token: string | null) => void;
  className?: string;
};

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function ensureTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("NO_WINDOW"));
  if (window.turnstile) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("TURNSTILE_SCRIPT_FAILED")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TURNSTILE_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({ siteKey, onTokenChange, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [widgetState, setWidgetState] = useState<"idle" | "ready" | "verified" | "error">("idle");

  useEffect(() => {
    onTokenChange(null);
  }, [onTokenChange]);

  useEffect(() => {
    let cancelled = false;

    if (!siteKey) {
      setScriptReady(false);
      setLoadError(null);
      setWidgetState("idle");
      return;
    }

    ensureTurnstileScript()
      .then(() => {
        if (cancelled) return;
        setScriptReady(true);
        setLoadError(null);
        setWidgetState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setScriptReady(false);
        setLoadError(String(err?.message ?? "TURNSTILE_LOAD_FAILED"));
        setWidgetState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) return;

    containerRef.current.innerHTML = "";
    onTokenChange(null);
    setLoadError(null);
    setWidgetState("ready");

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
        size: "flexible",
        appearance: "always",
        retry: "auto",
        language: "auto",
        callback: (token) => {
          setLoadError(null);
          setWidgetState("verified");
          onTokenChange(token);
        },
        "expired-callback": () => {
          setWidgetState("ready");
          onTokenChange(null);
        },
        "timeout-callback": () => {
          setWidgetState("ready");
          onTokenChange(null);
        },
        "unsupported-callback": () => {
          setWidgetState("error");
          setLoadError("TURNSTILE_UNSUPPORTED_BROWSER");
          onTokenChange(null);
        },
        "error-callback": (errorCode) => {
          setWidgetState("error");
          setLoadError(`TURNSTILE_${String(errorCode ?? "UNKNOWN")}`);
          onTokenChange(null);
          return true;
        },
      });
      widgetIdRef.current = widgetId;
    } catch (err: any) {
      setWidgetState("error");
      setLoadError(String(err?.message ?? "TURNSTILE_RENDER_FAILED"));
    }

    return () => {
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // noop
        }
      }
      widgetIdRef.current = null;
      setWidgetState("idle");
      onTokenChange(null);
    };
  }, [siteKey, scriptReady, onTokenChange]);

  if (!siteKey) {
    return (
      <div className={className}>
        <div className="rounded-xl border p-3 text-sm text-muted-foreground">
          Turnstile site key chưa được cấu hình ở frontend. Widget sẽ không hiện.
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="min-h-[65px]" />
      {!loadError && widgetState !== "verified" ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Hoàn tất xác minh Turnstile ở khung trên trước khi bấm Check key hoặc Reset key.
        </div>
      ) : null}
      {loadError ? (
        <div className="mt-2 rounded-xl border p-3 text-sm text-destructive">
          Không tải được Turnstile: {loadError}. Nếu mã là <code>110100</code>/<code>110110</code> thì site key sai hoặc site đang dùng key cũ. Nếu là <code>110200</code> thì hostname chưa được cấp quyền. Nếu là <code>200500</code> thì iframe/script của Turnstile đang bị chặn.
        </div>
      ) : null}
    </div>
  );
}
