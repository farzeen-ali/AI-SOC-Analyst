"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

import type { NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  sections: NavSection[];
  onNavigate?: () => void;
}

/**
 * Sidebar link list with a shared-layout indicator that slides to the active
 * route. Sections arrive pre-filtered by role from the server layout.
 */
export function SidebarNav({ sections, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" || href === "/super-admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.label} className="space-y-1">
          <p className="px-2.5 pb-1 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground/70 uppercase">
            {section.label}
          </p>

          {section.items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-lg border border-primary/20 bg-primary/10"
                  />
                )}

                <Icon
                  className={cn(
                    "relative size-4 shrink-0 transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="relative flex-1 truncate">{item.label}</span>

                {item.comingSoon && (
                  <span className="relative rounded border border-border/60 bg-muted/60 px-1 py-px font-mono text-[0.55rem] tracking-wide text-muted-foreground uppercase">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
