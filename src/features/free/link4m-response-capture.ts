import { saveLink4MClientBridge } from "@/features/free/link4m-client-bridge";

declare global {
  interface Window {
    __sunnyLink4MFetchCaptureInstalled?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__sunnyLink4MFetchCaptureInstalled) {
  window.__sunnyLink4MFetchCaptureInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    try {
      const requestUrl = String(typeof args[0] === "string" ? args[0] : args[0]?.url ?? "");
      if (/\/(free-start|free-gate)(?:\?|$)/.test(requestUrl)) {
        void response.clone().json().then((body) => {
          if (body?.link4m_client) saveLink4MClientBridge(body.link4m_client);
        }).catch(() => undefined);
      }
    } catch {
      // Keep the original network response untouched.
    }
    return response;
  };
}
