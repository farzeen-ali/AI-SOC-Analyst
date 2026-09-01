import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Request-scoped Supabase client backed by Next's cookie store.
 *
 * `cookies()` is async in Next 16, so this helper is too. Cookie writes are
 * only permitted inside Server Actions and Route Handlers; during Server
 * Component rendering `set` throws, which we swallow — the proxy has already
 * refreshed the session for that request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render pass — safe to ignore.
        }
      },
    },
  });
}
