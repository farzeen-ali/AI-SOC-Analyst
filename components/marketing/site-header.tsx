"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useScroll, useMotionValueEvent } from "framer-motion";
import { MenuIcon, XIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggleButton } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#platform", label: "Platform" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
];

/** Sticky marketing nav that condenses into a glass bar once the page scrolls. */
export function SiteHeader() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 24);
  });

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6">
      <motion.div
        initial={false}
        animate={{
          maxWidth: scrolled ? "62rem" : "76rem",
          paddingTop: scrolled ? "0.5rem" : "0.75rem",
          paddingBottom: scrolled ? "0.5rem" : "0.75rem",
        }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "mx-auto flex items-center gap-4 rounded-2xl px-4 transition-colors duration-300",
          scrolled
            ? "glass shadow-lg shadow-black/5"
            : "border border-transparent"
        )}
      >
        <Logo />

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggleButton />

          <Button
            variant="ghost"
            size="sm"
            className="hidden h-8 rounded-lg sm:inline-flex"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Sign in
          </Button>

          <Button
            size="sm"
            className="h-8 rounded-lg bg-gradient-to-r from-brand-1 to-brand-2 text-primary-foreground shadow-md shadow-primary/20 hover:brightness-110"
            nativeButton={false}
            render={<Link href="/signup" />}
          >
            Get started
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <XIcon className="size-4" /> : <MenuIcon className="size-4" />}
          </Button>
        </div>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="glass mx-auto mt-2 max-w-3xl overflow-hidden rounded-2xl p-2 md:hidden"
          >
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground sm:hidden"
            >
              Sign in
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
