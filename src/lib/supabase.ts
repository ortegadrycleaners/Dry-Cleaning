import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[Supabase] ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured.',
    'Please create a .env file with your Supabase credentials.',
    { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey }
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
