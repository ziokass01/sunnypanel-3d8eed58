alter table public.licenses_free_settings
  add column if not exists free_download_cards jsonb not null default '[]'::jsonb;

update public.licenses_free_settings
set free_download_cards = coalesce(
  nullif(free_download_cards, '[]'::jsonb),
  (
    (case
      when coalesce(free_download_url, '') <> '' then jsonb_build_array(
        jsonb_strip_nulls(
          jsonb_build_object(
            'enabled', coalesce(free_download_enabled, true),
            'title', nullif(free_download_name, ''),
            'description', nullif(free_download_info, ''),
            'url', free_download_url,
            'button_label', 'Mở liên kết',
            'badge', 'Link 1'
          )
        )
      )
      else '[]'::jsonb
    end)
    ||
    (case
      when coalesce(free_external_download_url, '') <> '' then jsonb_build_array(
        jsonb_strip_nulls(
          jsonb_build_object(
            'enabled', coalesce(free_external_download_enabled, true),
            'title', nullif(free_external_download_title, ''),
            'description', nullif(free_external_download_description, ''),
            'url', free_external_download_url,
            'button_label', nullif(free_external_download_button_label, ''),
            'badge', nullif(free_external_download_badge, ''),
            'icon_url', nullif(free_external_download_icon_url, '')
          )
        )
      )
      else '[]'::jsonb
    end)
  ),
  '[]'::jsonb
)
where id = 1;
