import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        theme?: "light" | "dark" | "auto";
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
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

function waitForTurnstile() {
  if (typeof window === "undefined") return Promise.reject(new Error("NO_WINDOW"));
  if (window.turnstile) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (window.turnstile) {
        resolve();
        return;
      }
      if (Date.now() - started > 10000) {
        reject(new Error("TURNSTILE_LOAD_TIMEOUT"));
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function ensureTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("NO_WINDOW"));
  if (window.turnstile) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      waitForTurnstile().then(resolve).catch(reject);
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      waitForTurnstile().then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error("TURNSTILE_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({ siteKey, onTokenChange, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onTokenChange(null);
  }, [onTokenChange]);

  useEffect(() => {
    let cancelled = false;

    if (!siteKey) {
      setScriptReady(false);
      setLoadError(null);
      return;
    }

    ensureTurnstileScript()
      .then(() => {
        if (cancelled) return;
        setScriptReady(true);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setScriptReady(false);
        setLoadError(String(err?.message ?? "TURNSTILE_LOAD_FAILED"));
      });

    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) return;

    containerRef.current.innerHTML = "";
    onTokenChange(null);

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: (token) => onTokenChange(token),
        "expired-callback": () => onTokenChange(null),
        "error-callback": () => onTokenChange(null),
      });
      widgetIdRef.current = widgetId;
    } catch (err: any) {
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
      <div ref={containerRef} />
      {loadError ? (
        <div className="mt-2 rounded-xl border p-3 text-sm text-destructive">
          Không tải được Turnstile: {loadError}
        </div>
      ) : null}
    </div>
  );
}
