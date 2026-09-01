import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What GuardAI stores and why.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro="An outline of the personal data GuardAI holds in Phase 1 and where it lives."
      sections={[
        {
          heading: "What is stored",
          body: "Account records hold your email address, display name, and avatar URL. Workspace records hold the tenant name, slug, plan, and owner. Audit records hold the action taken, the acting account, an IP address, and a user-agent string.",
        },
        {
          heading: "What is not stored",
          body: "Passwords are never stored by the application; authentication is delegated to Supabase Auth. Rate-limit and lockout counters key on a one-way hash of the email address rather than the address itself.",
        },
        {
          heading: "Tenant separation",
          body: "Records are scoped to a single workspace by PostgreSQL Row Level Security. Members of one workspace cannot read another workspace's rows through any application path.",
        },
        {
          heading: "Retention",
          body: "Audit entries are retained for the life of the workspace. Deleting a workspace cascades to its memberships and audit entries.",
        },
      ]}
    />
  );
}
