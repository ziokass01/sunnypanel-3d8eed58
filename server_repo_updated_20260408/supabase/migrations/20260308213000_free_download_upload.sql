ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_download_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_download_name text,
  ADD COLUMN IF NOT EXISTS free_download_info text,
  ADD COLUMN IF NOT EXISTS free_download_path text,
  ADD COLUMN IF NOT EXISTS free_download_url text,
  ADD COLUMN IF NOT EXISTS free_download_size bigint;

UPDATE public.licenses_free_settings
SET
  free_download_enabled = COALESCE(free_download_enabled, false)
WHERE id = 1;

INSERT INTO storage.buckets (id, name, public)
SELECT 'free-downloads', 'free-downloads', true
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'free-downloads'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'free_downloads_public_read'
  ) THEN
    CREATE POLICY free_downloads_public_read
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'free-downloads');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'free_downloads_admin_insert'
  ) THEN
    CREATE POLICY free_downloads_admin_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'free-downloads');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'free_downloads_admin_update'
  ) THEN
    CREATE POLICY free_downloads_admin_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'free-downloads')
      WITH CHECK (bucket_id = 'free-downloads');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'free_downloads_admin_delete'
  ) THEN
    CREATE POLICY free_downloads_admin_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'free-downloads');
  END IF;
END $$;
