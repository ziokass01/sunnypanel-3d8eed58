import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function TenantRoute({ children }: { children: JSX.Element }) {
  const [isTenant, setIsTenant] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    const check = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (isMounted) setIsTenant(false);
        return;
      }

      const { data, error } = await supabase.rpc("has_role", {
        _user_id: auth.user.id,
        _role: "tenant",
      });

      if (!isMounted) return;
      setIsTenant(!error && data === true);
    };

    check();
    return () => {
      isMounted = false;
    };
  }, []);

  if (isTenant === null) return null;
  if (!isTenant) return <Navigate to="/login" replace />;
  return children;
}
