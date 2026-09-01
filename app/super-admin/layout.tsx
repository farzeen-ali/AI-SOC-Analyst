import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireSuperAdmin, toUserDTO } from "@/lib/auth/dal";

/**
 * Platform-owner console. `requireSuperAdmin()` re-reads `global_role` from the
 * database, so the proxy's claim-based check is never the only thing standing
 * between a tenant user and cross-tenant data.
 */
export default async function SuperAdminLayout({
  children,
}: LayoutProps<"/super-admin">) {
  const context = await requireSuperAdmin();

  return (
    <DashboardShell user={toUserDTO(context)} variant="super-admin">
      {children}
    </DashboardShell>
  );
}
