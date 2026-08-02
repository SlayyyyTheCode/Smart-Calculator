import type { ZodError } from "zod";

/**
 * The shape every server action returns, so `useActionState` on the client can
 * render success and validation messages the same way everywhere.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Keyed by form field name. */
  fieldErrors?: Record<string, string>;
};

export const IDLE: ActionState = { status: "idle" };

export function ok(message?: string): ActionState {
  return { status: "success", message };
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: "error", message, fieldErrors };
}

/** First issue per field. Showing one message per input is enough to act on. */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export function invalid(error: ZodError): ActionState {
  return fail("Check the highlighted fields.", fieldErrorsFrom(error));
}

/** Turns a FormData into a plain object, dropping empty strings to undefined. */
export function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    values[key] = trimmed === "" ? undefined : trimmed;
  }
  return values;
}

/** Checkbox inputs are absent when unchecked; FormData has no boolean concept. */
export function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}
