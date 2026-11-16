import { createClient } from '@supabase/supabase-js';

// No frontend, utilize estritamente a ANON_KEY e a URL do projeto
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ Atenção: As chaves do Supabase não foram configuradas nas variáveis de ambiente.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);