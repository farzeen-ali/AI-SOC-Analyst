"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const LENGTH = 6;

interface OtpInputProps {
  name?: string;
  /** Fires once all six digits are present. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Six-box numeric code entry.
 *
 * Handles forward auto-advance, backspace that steps back through empty boxes,
 * arrow-key navigation, and pasting a full code into any box. The combined
 * value is mirrored into a hidden input so the surrounding `<form>` posts it
 * as a single `token` field.
 *
 * To clear the boxes (after a rejected code, or a resend), give the element a
 * new `key` so React remounts it — cheaper and less error-prone than syncing a
 * reset prop into state.
 */
export function OtpInput({
  name = "token",
  onComplete,
  disabled,
  className,
}: OtpInputProps) {
  const [digits, setDigits] = React.useState<string[]>(() =>
    Array<string>(LENGTH).fill("")
  );
  const inputs = React.useRef<Array<HTMLInputElement | null>>([]);
  const completedFor = React.useRef<string | null>(null);

  const code = digits.join("");

  React.useEffect(() => {
    if (code.length !== LENGTH) {
      completedFor.current = null;
      return;
    }
    // Guard against re-firing for a code we already submitted.
    if (completedFor.current === code) return;
    completedFor.current = code;
    onComplete?.(code);
  }, [code, onComplete]);

  const focusAt = (index: number) => {
    const target = inputs.current[Math.min(Math.max(index, 0), LENGTH - 1)];
    target?.focus();
    target?.select();
  };

  const write = (index: number, characters: string) => {
    const cleaned = characters.replace(/\D/g, "");
    if (!cleaned) return;

    setDigits((current) => {
      const next = [...current];
      for (let offset = 0; offset < cleaned.length; offset += 1) {
        const slot = index + offset;
        if (slot >= LENGTH) break;
        next[slot] = cleaned[offset];
      }
      return next;
    });

    focusAt(index + cleaned.length);
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      setDigits((current) => {
        const next = [...current];
        if (next[index]) {
          next[index] = "";
        } else if (index > 0) {
          next[index - 1] = "";
          focusAt(index - 1);
        }
        return next;
      });
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "Delete") {
      event.preventDefault();
      setDigits((current) => {
        const next = [...current];
        next[index] = "";
        return next;
      });
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <input type="hidden" name={name} value={code} readOnly />

      <div
        className="flex items-center justify-center gap-2 sm:gap-3"
        role="group"
        aria-label="6-digit verification code"
      >
        {digits.map((digit, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.24 }}
          >
            <input
              ref={(element) => {
                inputs.current[index] = element;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              disabled={disabled}
              aria-label={`Digit ${index + 1} of ${LENGTH}`}
              autoFocus={index === 0}
              onChange={(event) => write(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={(event) => {
                event.preventDefault();
                write(index, event.clipboardData.getData("text"));
              }}
              onFocus={(event) => event.target.select()}
              className={cn(
                "size-12 rounded-xl border bg-background/60 text-center font-mono text-xl font-semibold sm:size-14 sm:text-2xl",
                "transition-all duration-200 outline-none",
                "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25",
                "disabled:cursor-not-allowed disabled:opacity-60",
                digit
                  ? "border-primary/50 bg-primary/5 text-foreground shadow-sm"
                  : "border-input text-muted-foreground"
              )}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
