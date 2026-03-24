alter table licenses_free_settings
add column if not exists free_cached_short_bucket_pass1 text,
add column if not exists free_cached_short_url_pass1 text,
add column if not exists free_cached_short_bucket_pass2 text,
add column if not exists free_cached_short_url_pass2 text;
