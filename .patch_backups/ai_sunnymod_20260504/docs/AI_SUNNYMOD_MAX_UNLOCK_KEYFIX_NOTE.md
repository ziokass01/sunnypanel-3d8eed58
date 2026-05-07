# SunnyMod AI max unlock + free key fix

Patch fixes two production issues:

1. `/coding-ai` could still lock Max/Pro models after admin granted `max` because the frontend trusted stale `serverAllowedModels` over the current plan. The UI now allows a model when either the server model list includes it or the current plan code permits it.

2. Admin Test GetKey for `aisunny_h01` could still fall into the legacy `licenses` insert path and return `LICENSE_INSERT_FAILED` if the key type row had stale `app_code`. The backend now detects AI Coding by `app_code=ai-coding`, `code LIKE aisunny%`, or `key_signature=AI-SUNNY`.

Migration `20260504064500_ai_sunny_sync_key_fix.sql` also seeds `kind`, `value`, and `sort_order` for `aisunny_h01`, because `licenses_free_key_types` requires those columns.
