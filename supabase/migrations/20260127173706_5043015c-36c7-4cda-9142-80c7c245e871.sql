-- Ensure unique device per license
CREATE UNIQUE INDEX IF NOT EXISTS ux_license_device
  ON public.license_devices (license_id, device_id);
