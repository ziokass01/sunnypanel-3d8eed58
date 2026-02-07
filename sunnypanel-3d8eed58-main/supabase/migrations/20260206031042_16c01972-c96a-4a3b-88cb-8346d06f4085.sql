-- Enforce RLS even for table owners (FORCE ROW LEVEL SECURITY)
ALTER TABLE public.blocked_ips FORCE ROW LEVEL SECURITY;
ALTER TABLE public.free_ip_rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_issues FORCE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_key_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.verify_ip_rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.verify_new_device_rate_limits FORCE ROW LEVEL SECURITY;
