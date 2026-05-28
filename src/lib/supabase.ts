import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[Supabase] FATAL: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured. ' +
    'Please create a .env file with your Supabase credentials.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
