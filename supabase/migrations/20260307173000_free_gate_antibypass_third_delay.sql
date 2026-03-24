-- Separate third anti-bypass timer for gate entry, independent from pass1/pass2 delays
ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_gate_antibypass_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_gate_antibypass_seconds integer NOT NULL DEFAULT 0;

UPDATE public.licenses_free_settings
SET
  free_gate_antibypass_enabled = COALESCE(free_gate_antibypass_enabled, false),
  free_gate_antibypass_seconds = GREATEST(0, COALESCE(free_gate_antibypass_seconds, 0))
WHERE id IS NOT NULL;
