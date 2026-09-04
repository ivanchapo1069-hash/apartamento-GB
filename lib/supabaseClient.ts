import { createClient } from "@supabase/supabase-js";

// Chave anon/publishable: segura para o navegador por definição (não é secreta).
// Os valores literais são o fallback do projeto Apartamento GB; a env var,
// quando definida na Vercel, tem prioridade.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jjphpfkoykggltrtmvgv.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcGhwZmtveWtnZ2x0cnRtdmd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NzEyODcsImV4cCI6MjEwNDA0NzI4N30.iVAkGs_b-7NpA3HmqaGor4BWmRkTyVjx3mj2tfBw8co";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 5 },
  },
});
