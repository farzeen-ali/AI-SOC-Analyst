import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create your workspace",
  description:
    "Create a GuardAI workspace and start triaging security logs with an AI SOC analyst.",
};

export default function SignUpPage() {
  return <SignUpForm />;
}
