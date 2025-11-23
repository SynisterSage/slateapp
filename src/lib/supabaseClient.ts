import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or ANON key not set. Create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// Default client uses localStorage so sessions persist across browser restarts
export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
  }
});

// Alternate client that uses sessionStorage. Useful for "Remember me" unchecked flows
// Guard access to window for SSR safety
let _supabaseSession: SupabaseClient | null = null;
if (typeof window !== 'undefined') {
  _supabaseSession = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      // store session in sessionStorage so it is cleared when the browser/tab closes
      storage: window.sessionStorage as any,
    }
  });
}

export const supabaseSession = _supabaseSession || supabase;

export default supabase;
