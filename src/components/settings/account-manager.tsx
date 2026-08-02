"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { createAccount, setAccountArchived, updateAccount } from "@/lib/actions/accounts";
import { IDLE } from "@/lib/actions/result";
import { CURRENCIES } from "@/lib/currency";
import type { AccountOption } from "@/lib/data/accounts";
import { formatMoney, toMajorString } from "@/lib/money";
import { cn } from "@/lib/utils";

const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "credit", label: "Credit card" },
  { value: "brokerage", label: "Brokerage" },
  { value: "other", label: "Other" },
] as const;

type AccountManagerProps = {
  accounts: AccountOption[];
  defaultCurrency: string;
  locale: string;
};

export function AccountManager({ accounts, defaultCurrency, locale }: AccountManagerProps) {
  const [state, formAction, isPending] = useActionState(createAccount, IDLE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  const errors = state.fieldErrors ?? {};
  const active = accounts.filter((account) => !account.isArchived);
  const archived = accounts.filter((account) => account.isArchived);

  return (
    <div className="space-y-5">
      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New account" htmlFor="account-name" error={errors.name}>
            <Input id="account-name" name="name" placeholder="e.g. DBS Multiplier" required />
          </Field>

          <Field label="Type" htmlFor="account-type" error={errors.type}>
            <Select id="account-type" name="type" defaultValue="bank">
              {ACCOUNT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Currency" htmlFor="account-currency" error={errors.currency}>
            <Select id="account-currency" name="currency" defaultValue={defaultCurrency}>
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Opening balance"
            htmlFor="account-opening"
            error={errors.openingBalance}
          >
            <Input
              id="account-opening"
              name="openingBalance"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue=""
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isLiquid" defaultChecked className="size-4" />
          Counts as liquid cash
          <span className="text-muted-foreground">— included in your runway figure</span>
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add account"}
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

      <ul className="divide-y divide-border rounded-lg border border-border">
        {active.map((account) =>
          editingId === account.id ? (
            <li key={account.id} className="p-3">
              <EditAccountRow account={account} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={account.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{account.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ACCOUNT_TYPES.find((type) => type.value === account.type)?.label} ·{" "}
                  {account.currency}
                  {account.isLiquid ? " · liquid" : ""}
                </p>
              </div>
              <span className="tabular text-sm text-muted-foreground">
                {formatMoney(account.openingBalance, account.currency, locale)}
              </span>
              <button
                type="button"
                onClick={() => setEditingId(account.id)}
                aria-label={`Edit ${account.name}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
              <form action={setAccountArchived}>
                <input type="hidden" name="id" value={account.id} />
                <input type="hidden" name="archived" value="true" />
                <button
                  type="submit"
                  aria-label={`Archive ${account.name}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                >
                  <Archive className="size-4" aria-hidden />
                </button>
              </form>
            </li>
          ),
        )}
      </ul>

      {archived.length > 0 ? (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
            {archived.length} archived
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {archived.map((account) => (
              <li key={account.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className="flex-1 text-sm text-muted-foreground">{account.name}</span>
                <form action={setAccountArchived}>
                  <input type="hidden" name="id" value={account.id} />
                  <input type="hidden" name="archived" value="false" />
                  <button
                    type="submit"
                    aria-label={`Restore ${account.name}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  >
                    <ArchiveRestore className="size-4" aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function EditAccountRow({ account, onDone }: { account: AccountOption; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(updateAccount, IDLE);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state.status, onDone]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={account.id} />

      <div className="grid gap-2 sm:grid-cols-4">
        <Input name="name" defaultValue={account.name} aria-label="Account name" required />
        <Select name="type" defaultValue={account.type} aria-label="Account type">
          {ACCOUNT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
        <Select name="currency" defaultValue={account.currency} aria-label="Currency">
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code}
            </option>
          ))}
        </Select>
        <Input
          name="openingBalance"
          inputMode="decimal"
          defaultValue={toMajorString(account.openingBalance)}
          aria-label="Opening balance"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isLiquid"
            defaultChecked={account.isLiquid}
            className="size-4"
          />
          Counts as liquid cash
        </label>
        <Button type="submit" size="sm" disabled={isPending} aria-label="Save account">
          <Check aria-hidden />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} aria-label="Cancel">
          <X aria-hidden />
        </Button>
        {state.status === "error" && state.message ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
