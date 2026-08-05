"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IDLE, type ActionState } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

/**
 * Field errors reach the fields through context rather than a render prop.
 *
 * The obvious shape here is `children: (errors) => ReactNode`, and it does not
 * work: these forms are composed inside server components, and a function
 * cannot cross the server/client boundary — React rejects it at render with
 * "Functions are not valid as a child of Client Components". Context carries
 * the errors down instead, leaving `children` as ordinary elements, which
 * serialize fine.
 */
const FieldErrorsContext = createContext<Record<string, string>>({});

type EntityFieldProps = {
  /** Key into the action's fieldErrors — usually the input's `name`. */
  name: string;
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

/** A `Field` that reads its own error out of the surrounding `EntityForm`. */
export function EntityField({ name, ...props }: EntityFieldProps) {
  return <Field {...props} error={useContext(FieldErrorsContext)[name]} />;
}

type EntityFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: ReactNode;
};

/**
 * The shell shared by the goal, debt and asset forms: submit state, the
 * message, and clearing the fields once a save succeeds. Only the fields
 * differ between them, so only the fields are written three times.
 */
export function EntityForm({ action, submitLabel, children }: EntityFormProps) {
  const [state, formAction, isPending] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FieldErrorsContext.Provider value={state.fieldErrors ?? {}}>
        {children}
      </FieldErrorsContext.Provider>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        {state.message ? (
          <p
            role="status"
            className={cn(
              "text-sm",
              state.status === "error"
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
