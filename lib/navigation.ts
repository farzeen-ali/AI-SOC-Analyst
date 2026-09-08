import {
  ActivityIcon,
  BuildingIcon,
  CreditCardIcon,
  FileTerminalIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  ServerCogIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import type { UserDTO } from "@/lib/auth/dal";

export type NavAccess = "any" | "tenant_admin" | "super_admin";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  access: NavAccess;
  /** Marks routes whose feature work lands in a later phase. */
  comingSoon?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Navigation is filtered by role before it reaches the client, so a Member
 * never receives the markup for Billing, Team, or Workspace Settings. The
 * routes themselves re-check with `requireTenantAdmin()` — hiding a link is
 * presentation, not authorization.
 */
export const WORKSPACE_NAV: NavSection[] = [
  {
    label: "Operations",
    items: [
      {
        href: "/dashboard",
        label: "Overview",
        icon: LayoutDashboardIcon,
        access: "any",
      },
      {
        href: "/dashboard/threats",
        label: "Threat Dashboard",
        icon: ShieldAlertIcon,
        access: "any",
      },
      {
        href: "/dashboard/logs",
        label: "Log Ingestion",
        icon: FileTerminalIcon,
        access: "any",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/dashboard/team",
        label: "Team",
        icon: UsersIcon,
        access: "tenant_admin",
      },
      {
        href: "/dashboard/billing",
        label: "Billing & Plan",
        icon: CreditCardIcon,
        access: "tenant_admin",
        comingSoon: true,
      },
      {
        href: "/dashboard/settings",
        label: "Workspace Settings",
        icon: SlidersHorizontalIcon,
        access: "tenant_admin",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/settings/profile",
        label: "Profile & Security",
        icon: UserCogIcon,
        access: "any",
      },
    ],
  },
];

export const SUPER_ADMIN_NAV: NavSection[] = [
  {
    label: "Platform",
    items: [
      {
        href: "/super-admin",
        label: "Global Analytics",
        icon: ActivityIcon,
        access: "super_admin",
      },
      {
        href: "/super-admin/tenants",
        label: "Tenants",
        icon: BuildingIcon,
        access: "super_admin",
      },
      {
        href: "/super-admin/users",
        label: "Users",
        icon: UsersIcon,
        access: "super_admin",
      },
      {
        href: "/super-admin/audit",
        label: "Audit Logs",
        icon: ScrollTextIcon,
        access: "super_admin",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/dashboard",
        label: "My Workspace",
        icon: ServerCogIcon,
        access: "any",
      },
      {
        href: "/settings/profile",
        label: "Profile & Security",
        icon: UserCogIcon,
        access: "any",
      },
    ],
  },
];

export function canAccess(user: UserDTO, access: NavAccess): boolean {
  if (access === "any") return true;
  if (access === "super_admin") return user.isSuperAdmin;
  return user.isTenantAdmin;
}

/** Drops sections the user cannot see any item in. */
export function filterNav(
  sections: NavSection[],
  user: UserDTO
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccess(user, item.access)),
    }))
    .filter((section) => section.items.length > 0);
}
