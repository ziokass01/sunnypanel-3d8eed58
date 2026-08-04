import { QueryClient } from "@tanstack/react-query";

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const maybeError = error as { status?: number; response?: { status?: number } };
  return maybeError.status ?? maybeError.response?.status;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      retry: (failureCount, error) => {
        const status = getErrorStatus(error);
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});
