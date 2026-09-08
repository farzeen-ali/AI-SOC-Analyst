import type { Metadata } from "next";
import Link from "next/link";
import {
  FingerprintIcon,
  KeyRoundIcon,
  LogOutIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { LogoutForm } from "@/components/dashboard/logout-form";
import { Reveal } from "@/components/motion/reveal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireAuth, toUserDTO } from "@/lib/auth/dal";
import { roleLabel } from "@/lib/roles";

export const metadata: Metadata = { title: "Profile & Security" };

export default async function ProfileSettingsPage() {
  const context = await requireAuth();
  const user = toUserDTO(context);

  const details: Array<{ label: string; value: string }> = [
    { label: "Full name", value: user.fullName },
    { label: "Email", value: user.email },
    { label: "Role", value: roleLabel(user) },
    { label: "Workspace", value: user.workspaceName ?? "—" },
    {
      label: "Member since",
      value: new Date(context.profile.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Profile & Security"
        description="Your identity, credentials, and session controls. Available to every role."
      />

      <Reveal>
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-4">
            <Avatar size="lg">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
              <AvatarFallback className="bg-gradient-to-br from-brand-1/25 to-brand-2/25 text-sm font-semibold text-foreground">
                {user.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-heading text-base font-semibold">
                {user.fullName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-border/60">
            {details.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd className="truncate text-sm font-medium sm:max-w-[60%] sm:text-right">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </Reveal>

      <Reveal index={1}>
        <section className="space-y-3 rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-primary" />
            <h2 className="font-heading text-sm font-semibold">
              Credentials & sessions
            </h2>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">
                  Reset via a 6-digit code sent to your email.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-lg"
              nativeButton={false}
              render={<Link href="/forgot-password" />}
            >
              Change password
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <FingerprintIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Multi-factor authentication
                </p>
                <p className="text-xs text-muted-foreground">
                  TOTP enrolment ships with the Phase 2 account hardening work.
                </p>
              </div>
            </div>
            <span className="shrink-0 self-start rounded-md border border-border/60 bg-muted/50 px-2 py-1 font-mono text-[0.6rem] tracking-wide text-muted-foreground uppercase sm:self-auto">
              Coming soon
            </span>
          </div>
        </section>
      </Reveal>

      <Reveal index={2}>
        <section className="flex flex-col gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <LogOutIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium">Sign out everywhere</p>
              <p className="text-xs text-muted-foreground">
                Revokes your refresh token globally and clears this browser&apos;s
                session cookies.
              </p>
            </div>
          </div>
          {/* Sign-out point 3 of 3: global profile settings. */}
          <div className="shrink-0 sm:w-auto">
            <LogoutForm variant="button" label="Sign out" />
          </div>
        </section>
      </Reveal>
    </div>
  );
}
