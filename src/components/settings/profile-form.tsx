"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { IDLE } from "@/lib/actions/result";
import { updateProfile } from "@/lib/actions/profile";
import { CURRENCIES, LOCALES, TIMEZONES } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { ProfileRow } from "@/types/database";

export function ProfileForm({ profile }: { profile: ProfileRow | null }) {
  const [state, formAction, isPending] = useActionState(updateProfile, IDLE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={profile?.display_name ?? ""}
          placeholder="What should we call you?"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Base currency"
          htmlFor="baseCurrency"
          error={errors.baseCurrency}
          hint="Every amount is recorded and shown in this currency."
        >
          <Select id="baseCurrency" name="baseCurrency" defaultValue={profile?.base_currency}>
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Number and date format"
          htmlFor="locale"
          error={errors.locale}
        >
          <Select id="locale" name="locale" defaultValue={profile?.locale}>
            {LOCALES.map((locale) => (
              <option key={locale.code} value={locale.code}>
                {locale.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Timezone"
          htmlFor="timezone"
          error={errors.timezone}
          hint="Decides what counts as today when you record an expense."
        >
          <Select id="timezone" name="timezone" defaultValue={profile?.timezone}>
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Month starts on day"
          htmlFor="monthStartDay"
          error={errors.monthStartDay}
          hint="Set this to your payday to budget on a salary cycle."
        >
          <Input
            id="monthStartDay"
            name="monthStartDay"
            type="number"
            min={1}
            max={28}
            defaultValue={profile?.month_start_day ?? 1}
          />
        </Field>
      </div>

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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
