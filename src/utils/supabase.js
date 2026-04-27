import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Ensure we have values before creating client, otherwise it might throw or be useless
if (supabaseUrl && !supabaseKey) {
  console.error('Supabase URL found but API Key is missing! Check VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY.');
}

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (!supabase) {
  console.warn('Supabase client not initialized. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY.');
}

export default supabase;
