import { z } from "zod";

/**
 * Shape returned by every auth Server Action.
 *
 * Lives in its own module (no `server-only`) so Client Components can import
 * the type for `useActionState` without dragging server code into the bundle.
 */
export interface AuthActionState {
  status: "idle" | "error" | "success";
  message: string;
  /** Per-field messages keyed by the form field name. */
  fieldErrors: Record<string, string[]>;
  /** Seconds the caller must wait, when the failure was a rate limit or lock. */
  retryAfter?: number;
  /** Echoed back so multi-step flows (OTP) can carry the address forward. */
  email?: string;
  /** Incremented on every response so effects can react to repeat failures. */
  nonce?: number;
}

export const initialAuthActionState: AuthActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};

export function actionError(
  message: string,
  extra: Partial<AuthActionState> = {}
): AuthActionState {
  return {
    status: "error",
    message,
    fieldErrors: {},
    nonce: Date.now(),
    ...extra,
  };
}

export function actionSuccess(
  message: string,
  extra: Partial<AuthActionState> = {}
): AuthActionState {
  return {
    status: "success",
    message,
    fieldErrors: {},
    nonce: Date.now(),
    ...extra,
  };
}

/** Converts a Zod failure into the field-error map the forms render. */
export function fromZodError(
  error: z.ZodError,
  message = "Please fix the highlighted fields."
): AuthActionState {
  const flattened = z.flattenError(error);
  return {
    status: "error",
    message,
    fieldErrors: flattened.fieldErrors as Record<string, string[]>,
    nonce: Date.now(),
  };
}
