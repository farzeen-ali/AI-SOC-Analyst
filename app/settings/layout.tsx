import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAuth, toUserDTO } from "@/lib/auth/dal";

/** Account settings are open to every authenticated role. */
export default async function SettingsLayout({
  children,
}: LayoutProps<"/settings">) {
  const context = await requireAuth();
  const user = toUserDTO(context);

  return (
    <DashboardShell
      user={user}
      variant={user.isSuperAdmin ? "super-admin" : "workspace"}
    >
      {children}
    </DashboardShell>
  );
}
