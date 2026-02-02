import { useEffect, useRef, useState } from "react";
import "@/features/free/turnstile";

type Props = {
  siteKey: string;
  onToken: (token: string) => void;
};

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (existing) {
      resolve();
      return;
    }

    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });

  return scriptPromise;
}

export function TurnstileWidget({ siteKey, onToken }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        setReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Turnstile load error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!window.turnstile) return;

    const host = hostRef.current;
    host.innerHTML = "";
    widgetIdRef.current = window.turnstile.render(host, {
      sitekey: siteKey,
      theme: "auto",
      callback: (token: string) => onToken(token),
    });

    return () => {
      try {
        if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
      } catch {
        // ignore
      }
    };
  }, [ready, siteKey, onToken]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  return <div ref={hostRef} />;
}
