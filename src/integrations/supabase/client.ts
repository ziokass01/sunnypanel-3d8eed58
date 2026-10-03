// Supabase client shared by public and admin routes.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

if(!SUPABASE_URL||!SUPABASE_ANON_KEY)throw new Error('APP_CONFIG');
// Restricted browser storage must not prevent the public page from mounting.
let authStorage:Storage|undefined;
try{authStorage=window.localStorage;}catch{authStorage=undefined;}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    persistSession: !!authStorage,
    autoRefreshToken: true,
  }
});
