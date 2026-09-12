import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let didResolveInitialSession = false;
    let sessionEventVersion = 0;

    const commitSession = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user?.id ?? null;
      if (currentUserIdRef.current !== nextUserId) {
        // A TanStack cache is process-wide.  Never let private license data
        // survive an account switch, while allowing token refreshes for the
        // same user to keep the current route and form mounted.
        queryClient.clear();
        currentUserIdRef.current = nextUserId;
      }
      setSession(nextSession);
      setLoading(false);
    };

    // IMPORTANT: subscribe BEFORE calling getSession
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // CRITICAL: avoid redirect loops on hard refresh.
      // Supabase may emit INITIAL_SESSION with null before getSession() resolves.
      // If we flip loading=false here, AuthGate can redirect to /login prematurely.
      if (event === "INITIAL_SESSION" && !didResolveInitialSession) return;

      sessionEventVersion += 1;
      commitSession(nextSession);
    });

    const getSessionVersion = sessionEventVersion;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        didResolveInitialSession = true;
        // A SIGNED_OUT/SIGNED_IN event that arrived first is newer than this
        // initial snapshot.  Do not resurrect the old account after logout.
        if (sessionEventVersion === getSessionVersion) {
          commitSession(data.session ?? null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        didResolveInitialSession = true;
        if (sessionEventVersion === getSessionVersion) commitSession(null);
        setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        const nextSession = data.session ?? null;
        const nextUserId = nextSession?.user?.id ?? null;
        if (currentUserIdRef.current !== nextUserId) {
          queryClient.clear();
          currentUserIdRef.current = nextUserId;
        }
        setSession(nextSession);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
