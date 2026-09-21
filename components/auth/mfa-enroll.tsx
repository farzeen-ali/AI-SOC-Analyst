"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CopyIcon,
  FingerprintIcon,
  KeyRoundIcon,
  Loader2Icon,
  QrCodeIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { MfaFactor } from "@/lib/auth/mfa";
import { cn } from "@/lib/utils";

/**
 * Multi-factor enrolment.
 *
 * Two factor types are offered because availability differs by project:
 *
 *  - **Authenticator app (TOTP)** works on every Supabase plan and in every
 *    browser, so it is the default.
 *  - **WebAuthn** (Windows Hello / Touch ID / security key) is stronger — the
 *    private key never leaves the device's secure hardware, so there is no
 *    shared secret to phish — but it is gated behind the Passkeys feature and
 *    is not enabled on every project.
 *
 * The rest of the system is factor-agnostic: the `has_mfa` claim and the
 * `aal` gate in `proxy.ts` do not care which type satisfied the challenge.
 */

interface TotpEnrolment {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

/**
 * Turn the enrolment QR into something `<img>` will actually load.
 *
 * Supabase's own typings disagree about the shape of `qr_code`: the field doc
 * says to prepend `data:image/svg+xml;utf-8,`, while the usage example feeds it
 * straight to `src`. Both shapes are handled here rather than betting on one.
 *
 * The namespace fix is the important part. An SVG loaded as a *document* — via
 * `<img src="data:…">` — is parsed as XML, and a root `<svg>` with no `xmlns`
 * is rejected outright, which renders as a broken image with no console error.
 * Inline SVG in HTML does not need it, so generators often leave it out.
 *
 * Returns null when the payload is missing or is not markup we recognise, and
 * the caller falls back to manual entry.
 */
function toQrSrc(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;

  // Already a complete data/blob/http URL.
  if (/^(data:|blob:|https?:)/i.test(value)) return value;
  if (!value.startsWith("<")) return null;

  const namespaced = /\sxmlns\s*=/i.test(value)
    ? value
    : value.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(namespaced)}`;
}

export function MfaEnroll({
  factors,
  className,
}: {
  factors: MfaFactor[];
  className?: string;
}) {
  const router = useRouter();

  const [busy, setBusy] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [totp, setTotp] = React.useState<TotpEnrolment | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [codeError, setCodeError] = React.useState<string | null>(null);
  // Remount key for the code boxes: OtpInput suppresses a repeat `onComplete`
  // for a code it already reported, so a rejected attempt needs a fresh mount.
  const [attempt, setAttempt] = React.useState(0);
  const [qrBroken, setQrBroken] = React.useState(false);
  const [webauthnSupported, setWebauthnSupported] = React.useState(false);
  const [platformAuthenticator, setPlatformAuthenticator] =
    React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const hasApi =
        typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined";
      if (!hasApi) return;

      let platform = false;
      try {
        platform =
          await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch {
        platform = false;
      }

      if (!cancelled) {
        setWebauthnSupported(true);
        setPlatformAuthenticator(platform);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- TOTP ---------------- */

  async function startTotp() {
    setBusy(true);
    setCodeError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: name.trim().slice(0, 40) || `Authenticator ${Date.now()}`,
        issuer: "GuardAI",
      });

      if (error) {
        toast.error("Could not start enrolment", { description: error.message });
        return;
      }

      setQrBroken(false);
      setTotp({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Abandoning enrolment leaves an unverified factor behind on the account,
   * which would show up in future factor lists, so it is cleaned up here.
   */
  async function cancelTotp() {
    const pending = totp;
    setTotp(null);
    setCodeError(null);
    if (!pending) return;

    try {
      await createClient().auth.mfa.unenroll({ factorId: pending.factorId });
    } catch {
      // Non-fatal: an orphaned unverified factor is harmless.
    }
  }

  const confirmTotp = React.useCallback(
    async (code: string) => {
      if (!totp || verifying) return;

      setVerifying(true);
      setCodeError(null);

      try {
        const supabase = createClient();
        const { error } = await supabase.auth.mfa.challengeAndVerify({
          factorId: totp.factorId,
          code,
        });

        if (error) {
          setAttempt((count) => count + 1);
          setCodeError(
            /invalid|incorrect/i.test(error.message)
              ? "That code was not accepted. Codes rotate every 30 seconds — try the current one."
              : error.message
          );
          return;
        }

        toast.success("Authenticator enrolled", {
          description:
            "Sign out and back in to see the step-up prompt on your next sign-in.",
        });
        setTotp(null);
        setName("");
        router.refresh();
      } finally {
        setVerifying(false);
      }
    },
    [totp, verifying, router]
  );

  /* ---------------- WebAuthn ---------------- */

  async function enrollWebauthn() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.webauthn.register({
        friendlyName:
          name.trim().slice(0, 40) ||
          (platformAuthenticator ? "This device" : "Security key"),
      });

      if (error) {
        const message = error.message ?? "Enrolment failed.";

        if (/NotAllowed|abort|cancel/i.test(message)) {
          toast.info("Enrolment cancelled.");
          return;
        }

        // The project-level Passkeys feature is off. Say so plainly rather
        // than surfacing a raw API string the user cannot act on.
        if (/disabled/i.test(message)) {
          toast.error("WebAuthn is not enabled on this project", {
            description:
              "Enable Authentication → Passkeys in Supabase, or use an authenticator app instead.",
          });
          return;
        }

        toast.error("Could not enrol this device", { description: message });
        return;
      }

      toast.success("Device enrolled", {
        description:
          "Sign out and back in to see the step-up prompt on your next sign-in.",
      });
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- Shared ---------------- */

  async function remove(factorId: string) {
    setRemovingId(factorId);
    try {
      const { error } = await createClient().auth.mfa.unenroll({ factorId });
      if (error) {
        toast.error("Could not remove that factor", {
          description: error.message,
        });
        return;
      }
      toast.success("Factor removed.");
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  const qrSrc = totp ? toQrSrc(totp.qrCode) : null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Enrolled factors */}
      <AnimatePresence initial={false}>
        {factors.map((factor) => (
          <motion.div
            key={factor.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-success/25 bg-success/[0.06] px-3 py-2.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-success/30 bg-success/10">
              <ShieldCheckIcon className="size-4 text-success" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {factor.friendlyName}
              </p>
              <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
                {factor.factorType === "totp" ? "authenticator app" : "webauthn"}{" "}
                · added {new Date(factor.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${factor.friendlyName}`}
              disabled={removingId === factor.id}
              onClick={() => remove(factor.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              {removingId === factor.id ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <Trash2Icon className="size-3.5" />
              )}
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* TOTP enrolment in progress */}
      {totp ? (
        <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.05] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Scan with your authenticator</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Use Google Authenticator, 1Password, Authy, Microsoft
                Authenticator, or any TOTP app.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel enrolment"
              onClick={cancelTotp}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/*
              Rendered as a plain <img> rather than next/image: the payload is
              per-user, single-use, and must never reach an optimisation cache.
              Loading the SVG as a document (rather than inlining the markup)
              also means any script inside it can never execute.
            */}
            {qrSrc && !qrBroken ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={qrSrc}
                alt="QR code for authenticator app enrolment"
                width={160}
                height={160}
                onError={() => setQrBroken(true)}
                className="size-40 shrink-0 rounded-lg bg-white p-2"
              />
            ) : (
              <div className="flex size-40 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 p-3 text-center">
                <QrCodeIcon className="size-5 text-muted-foreground" />
                <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
                  The QR image could not be displayed. Use the setup key
                  instead — it enrols exactly the same factor.
                </p>
              </div>
            )}

            <div className="w-full space-y-2">
              <Label htmlFor="totp-secret" className="text-xs">
                Or enter this key manually
              </Label>
              <div className="flex gap-2">
                <Input
                  id="totp-secret"
                  readOnly
                  value={totp.secret}
                  className="h-9 rounded-lg font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy setup key"
                  className="size-9 shrink-0 rounded-lg"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(totp.secret)
                      .then(() => toast.success("Setup key copied"))
                      .catch(() => toast.error("Could not copy"));
                  }}
                >
                  <CopyIcon className="size-3.5" />
                </Button>
              </div>

              {/*
                Hands the enrolment straight to a registered authenticator.
                `otpauth://` is the standard scheme every TOTP app claims, so
                this works even when the QR cannot be scanned or displayed.
              */}
              <a
                href={totp.uri}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                <SmartphoneIcon className="size-3" />
                Open in your authenticator app
              </a>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">
              Enter the 6-digit code from your app
            </Label>
            <OtpInput
              key={attempt}
              name="totp-code"
              onComplete={confirmTotp}
              disabled={verifying}
            />
            {verifying && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" />
                Verifying…
              </p>
            )}
            {codeError && (
              <p role="alert" className="text-center text-xs text-destructive">
                {codeError}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Method picker */
        <div className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-3">
          <div className="space-y-2">
            <Label htmlFor="factor-name" className="text-xs">
              Device name{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="factor-name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder="Work laptop"
              className="h-9 rounded-xl"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={startTotp}
              className="group flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/40 p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin text-primary" />
                ) : (
                  <SmartphoneIcon className="size-4 text-primary" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  Authenticator app
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  A 6-digit code from your phone. Works everywhere.
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={busy || !webauthnSupported}
              onClick={enrollWebauthn}
              className="group flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/40 p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50">
                {platformAuthenticator ? (
                  <FingerprintIcon className="size-4" />
                ) : (
                  <KeyRoundIcon className="size-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {platformAuthenticator ? "This device" : "Security key"}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {webauthnSupported
                    ? "Windows Hello, Touch ID, or a key. Requires Passkeys enabled."
                    : "Not supported by this browser."}
                </span>
              </span>
            </button>
          </div>

          {factors.length === 0 && (
            <p className="flex items-start gap-1.5 text-[0.7rem] leading-relaxed text-muted-foreground">
              <TriangleAlertIcon className="mt-px size-3 shrink-0 text-warning" />
              Keep a recovery route: enrol a second factor, or make sure you can
              still receive password-reset email.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
