import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of service for GuardAI workspaces.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The structure of the agreement between a GuardAI deployment and the workspaces it hosts."
      sections={[
        {
          heading: "Workspaces and roles",
          body: "The account that creates a workspace becomes its Tenant Admin and is responsible for the members it invites. Members hold the SOC Analyst role and cannot access billing, workspace settings, or team management.",
        },
        {
          heading: "Acceptable use",
          body: "Workspaces may only be used to analyse security telemetry the operator is authorised to process. Attempting to reach another tenant's data, or to circumvent rate limits and lockouts, is grounds for suspension.",
        },
        {
          heading: "Suspension",
          body: "The platform owner may suspend a workspace or an individual account. Suspension revokes access immediately and is reversible; it does not delete stored data.",
        },
        {
          heading: "Availability",
          body: "No uptime commitment is made by this scaffold. A production deployment should state its own service levels here.",
        },
      ]}
    />
  );
}
