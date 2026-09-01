"use client";

import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Browser Supabase client. Session tokens live in cookies written by
 * `@supabase/ssr`, so the server can read the same session.
 */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
