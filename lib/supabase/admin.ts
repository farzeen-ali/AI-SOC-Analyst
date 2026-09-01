import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Service-role client. Bypasses Row Level Security entirely.
 *
 * Only reach for this where RLS genuinely cannot express the operation —
 * Super Admin platform queries, or pre-session lookups during login. Every
 * call site must do its own authorization check first.
 */
export function createAdminClient() {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
