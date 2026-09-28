import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ClockIcon,
  LinkIcon,
  ShieldOffIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react";

import { AuthHeader } from "@/components/auth/auth-header";
import { JoinForm } from "@/components/team/join-form";
import { Button } from "@/components/ui/button";
import {
  resolveInvitation,
  type InvitationProblem,
} from "@/lib/team/invitations";

export const metadata: Metadata = {
  title: "Join a workspace",
  description: "Accept your GuardAI analyst invitation.",
  // An invitation URL contains a live credential. Keeping it out of search
  // indexes is the least this page can do.
  robots: { index: false, follow: false },
};

/** Invitation links are one-per-visitor; nothing here may be cached. */
export const dynamic = "force-dynamic";

const PROBLEMS: Record<
  InvitationProblem,
  { icon: typeof ClockIcon; title: string; body: string }
> = {
  not_found: {
    icon: LinkIcon,
    title: "This link is not valid",
    body: "Double-check that you copied the whole link. If it still fails, ask your Tenant Admin to send a fresh invitation.",
  },
  expired: {
    icon: ClockIcon,
    title: "This invitation has expired",
    body: "Invitations are valid for 72 hours. Ask your Tenant Admin to issue a new one.",
  },
  revoked: {
    icon: ShieldOffIcon,
    title: "This invitation was revoked",
    body: "A Tenant Admin cancelled it. Get in touch with them if you still need access.",
  },
  accepted: {
    icon: UserCheckIcon,
    title: "This invitation has already been used",
    body: "The account exists. Sign in with the invited address instead.",
  },
  seats_full: {
    icon: UsersIcon,
    title: "That workspace is out of seats",
    body: "Every seat on the current plan is taken. Ask your Tenant Admin to upgrade or free one up.",
  },
  email_taken: {
    icon: UserCheckIcon,
    title: "An account already exists",
    body: "That address is already registered with GuardAI. Sign in instead of joining.",
  },
  workspace_suspended: {
    icon: ShieldOffIcon,
    title: "That workspace is not active",
    body: "It has been suspended. Contact your administrator for details.",
  },
};

/**
 * Member registration page for a tokenized invitation.
 *
 * The token comes in through the URL, so the page is public by necessity.
 * Everything it reveals is scoped to a valid token — an invalid one gets a
 * generic failure rather than any hint about which workspaces exist.
 */
export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const result = await resolveInvitation(token);

  if (!result.ok) {
    const problem = PROBLEMS[result.problem];
    const Icon = problem.icon;

    return (
      <div className="space-y-7">
        <AuthHeader
          eyebrow="Invitation"
          title={problem.title}
          description={problem.body}
        />

        <div className="animate-rise flex flex-col items-center gap-5 rounded-2xl border border-border/60 bg-card/50 px-6 py-8">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10">
            <Icon className="size-6 text-warning" />
          </span>

          <Button
            className="h-10 w-full rounded-xl"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Go to sign in
          </Button>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to GuardAI
        </Link>
      </div>
    );
  }

  return (
    <JoinForm
      token={token}
      email={result.invitation.email}
      workspaceName={result.invitation.workspaceName}
    />
  );
}
