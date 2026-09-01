import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAuth, toUserDTO } from "@/lib/auth/dal";

/**
 * Authoritative gate for every `/dashboard/*` route.
 *
 * The proxy already bounced signed-out visitors optimistically; `requireAuth`
 * re-verifies the session and reads the profile through RLS, so a forged or
 * stale JWT claim cannot get past this point.
 */
export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const context = await requireAuth();

  return (
    <DashboardShell user={toUserDTO(context)}>{children}</DashboardShell>
  );
}
