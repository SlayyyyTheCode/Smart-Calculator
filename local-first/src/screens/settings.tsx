import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { Field, Input } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";
import { ageOn, scheduleOn, type CpfResidency } from "@app/lib/domain/cpf";
import { formatMoney, parseAmount } from "@app/lib/money";

import { evolu } from "../db";
import { NONE } from "../schema";
import { isKnownCurrency, SUPPORTED_CURRENCIES, useMoneyFormat } from "../money-format";
import { usePersistence } from "../persistence";
import { accountBalances } from "../repository";
import { TODAY } from "../today";
import type { AccountRow, CategoryRow, SettingRow, TransactionRow } from "../db";

/**
 * A short list rather than every BCP 47 tag in existence.
 *
 * The locale decides digit grouping, the decimal mark and where the symbol
 * sits — 1.234,50 € against €1,234.50. A free text box here would mostly
 * collect typos, and a typo silently falls back rather than saying anything.
 */
const LOCALES = [
  { value: "en-SG", label: "English (Singapore)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "ja-JP", label: "Japanese (Japan)" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "ms-MY", label: "Malay (Malaysia)" },
  { value: "hi-IN", label: "Hindi (India)" },
] as const;

/**
 * Categories and accounts: the things everything else is built on.
 *
 * Archiving rather than deleting is the point of the toggle. A deleted category
 * takes its history's meaning with it; an archived one stays off the pickers
 * while every transaction that used it still says what it was.
 */
export function Settings({
  categories,
  accounts,
  transactions,
  settings,
}: {
  categories: readonly CategoryRow[];
  accounts: readonly AccountRow[];
  transactions: readonly TransactionRow[];
  settings: readonly SettingRow[];
}) {
  const { money, locale, currency } = useMoneyFormat();
  const setting = settings[0];
  const persisted = usePersistence();
  const [currencyDraft, setCurrencyDraft] = useState(currency);
  const [localeDraft, setLocaleDraft] = useState(locale);
  const [formatError, setFormatError] = useState<string | null>(null);
  const [birthDraft, setBirthDraft] = useState(
    String(setting?.birthDate ?? NONE) === NONE ? "" : String(setting?.birthDate),
  );
  const [residencyDraft, setResidencyDraft] = useState(String(setting?.cpfResidency ?? NONE));
  const [cpfError, setCpfError] = useState<string | null>(null);

  /**
   * Date of birth is stored because CPF rates step down by age band, and the
   * band has to be the one that applied on the day of the payment rather than
   * the one that applies now. Storing the date rather than an age means a
   * birthday does not silently restate last year's payslips.
   */
  const saveCpf = (event: React.FormEvent) => {
    event.preventDefault();
    if (residencyDraft !== NONE && !/^\d{4}-\d{2}-\d{2}$/.test(birthDraft)) {
      setCpfError("A date of birth is needed to pick the right age band.");
      return;
    }
    if (birthDraft && ageOn(birthDraft, TODAY) < 0) {
      setCpfError("That date is in the future.");
      return;
    }
    const patch = {
      birthDate: birthDraft || NONE,
      cpfResidency: residencyDraft,
    };
    const result = setting
      ? evolu.update("setting", { id: setting.id, ...patch })
      : evolu.insert("setting", { baseCurrency: currency, locale, ...patch });
    if (!result.ok) return setCpfError(JSON.stringify(result.error));
    setCpfError(null);
  };

  /**
   * Checked against the real list, not against whether the formatter complains.
   *
   * The obvious check is to format something and catch the error, and it does
   * not work: Intl only rejects a *malformed* code. "XYZ" is three letters, so
   * it is accepted and printed verbatim — measured, every amount on every
   * screen read "1.234,50 XYZ" without a single error. Nothing crashed, which
   * is precisely why it would have shipped.
   */
  const saveFormat = (event: React.FormEvent) => {
    event.preventDefault();
    const code = currencyDraft.trim().toUpperCase();
    if (!isKnownCurrency(code)) {
      setFormatError(`${code || "That"} is not a currency code. Try SGD, USD, EUR.`);
      return;
    }
    const result = setting
      ? evolu.update("setting", { id: setting.id, baseCurrency: code, locale: localeDraft })
      : evolu.insert("setting", { baseCurrency: code, locale: localeDraft, birthDate: NONE, cpfResidency: NONE });
    if (!result.ok) return setFormatError(JSON.stringify(result.error));
    setFormatError(null);
  };

  const [categoryName, setCategoryName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);

  const balances = accountBalances(accounts, transactions);

  const addCategory = (event: React.FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return setError("Give the category a name");
    const result = evolu.insert("category", {
      name: categoryName.trim(),
      kind: "expense",
      color: "#64748b",
      sortOrder: (categories.length + 1) * 10,
      isArchived: 0,
      incomeType: NONE,
      isCpfEligible: 0,
    });
    if (!result.ok) return setError(JSON.stringify(result.error));
    setError(null);
    setCategoryName("");
  };

  const addAccount = (event: React.FormEvent) => {
    event.preventDefault();
    const minor = parseAmount(opening || "0");
    if (!accountName.trim() || minor === null) return setError("Give the account a name");
    const result = evolu.insert("account", {
      name: accountName.trim(),
      type: "bank",
      openingBalanceMinor: minor,
      isLiquid: 1,
      isArchived: 0,
    });
    if (!result.ok) return setError(JSON.stringify(result.error));
    setError(null);
    setAccountName("");
    setOpening("");
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Currency, categories and accounts — everything else is built on these."
      />

      {persisted === false ? (
        // Shown only when the browser refused. Saying "your storage is fine" to
        // everybody else is noise; saying nothing when it is not fine is how a
        // year of records disappears without warning.
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground"
          data-testid="storage-warning"
        >
          <strong className="font-medium text-foreground">This browser has not promised to keep your data.</strong>{" "}
          It may clear it if the device runs low on space. Installing the app to your home screen
          usually earns the guarantee — or turn on sync, so a second device holds a copy.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Currency and formatting</CardTitle>
          <CardDescription>
            Applies everywhere at once. Amounts already recorded are not converted — this changes
            how they are written, not what they are worth.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveFormat} className="grid gap-3 sm:grid-cols-3">
            <Field label="Currency" htmlFor="currency" error={formatError ?? undefined}>
              <Input
                id="currency"
                data-testid="currency"
                value={currencyDraft}
                // Upper-cased on the way in because ISO 4217 codes are, and
                // "sgd" typed in lowercase would otherwise be rejected as
                // unknown by Intl for no reason the user can see.
                onChange={(event) => setCurrencyDraft(event.target.value.toUpperCase().slice(0, 3))}
                placeholder="SGD"
                list="currency-codes"
              />
              <datalist id="currency-codes">
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </Field>
            <Field label="Format as" htmlFor="locale">
              <select
                id="locale"
                data-testid="locale"
                value={localeDraft}
                onChange={(event) => setLocaleDraft(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                {LOCALES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" data-testid="save-format">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3" data-testid="format-preview">
              Currently {currency} · a thousand and a half shows as {money(150000)}
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CPF and take-home pay</CardTitle>
          <CardDescription>
            For Singapore Citizens and PRs. Income filed under a salary category is shown gross,
            with your CPF share and the take-home figure worked out from it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveCpf} className="grid gap-3 sm:grid-cols-3">
            <Field label="Status" htmlFor="residency" error={cpfError ?? undefined}>
              <select
                id="residency"
                data-testid="residency"
                value={residencyDraft}
                onChange={(event) => setResidencyDraft(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <option value={NONE}>CPF does not apply</option>
                <option value="citizen_or_pr3">Citizen, or PR 3rd year onwards</option>
                <option value="pr_year1">PR, 1st year</option>
                <option value="pr_year2">PR, 2nd year</option>
              </select>
            </Field>
            <Field label="Date of birth" htmlFor="birth-date">
              <Input
                id="birth-date"
                data-testid="birth-date"
                type="date"
                value={birthDraft}
                onChange={(event) => setBirthDraft(event.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" data-testid="save-cpf">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3" data-testid="cpf-status">
              {residencyDraft === NONE
                ? "No CPF is deducted; salary is shown as entered."
                : birthDraft
                  ? `Age ${ageOn(birthDraft, TODAY)} today. Rates from ${scheduleOn(TODAY).label}, chosen by the date on each entry; only your own share is deducted, since the employer's was never part of your gross.`
                  : "Add a date of birth to pick the age band."}
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Archiving keeps a category off your pickers while leaving past transactions labelled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border" data-testid="category-list">
            {categories.map((category) => {
              const archived = Number(category.isArchived) === 1;
              return (
                <li key={String(category.id)} className="flex items-center gap-3 py-2.5">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: String(category.color) }}
                    aria-hidden
                  />
                  <span className={archived ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>
                    {String(category.name)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="toggle-archive"
                    onClick={() =>
                      evolu.update("category", { id: category.id, isArchived: archived ? 0 : 1 })
                    }
                  >
                    {archived ? "Restore" : "Archive"}
                  </Button>
                </li>
              );
            })}
          </ul>

          <form onSubmit={addCategory} className="flex items-end gap-3">
            <Field label="New category" htmlFor="category-name" error={error ?? undefined} className="flex-1">
              <Input
                id="category-name"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="e.g. Childcare"
              />
            </Field>
            <Button type="submit" data-testid="add-category">
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Balances are the opening figure plus everything confirmed since.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border" data-testid="account-list">
            {accounts.map((account) => (
              <li key={String(account.id)} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{String(account.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    opened at {money(Number(account.openingBalanceMinor))}
                  </p>
                </div>
                <span className="tabular text-sm font-medium" data-testid="account-balance">
                  {money(balances.get(String(account.id)) ?? 0)}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${String(account.name)}`}
                  onClick={() => evolu.update("account", { id: account.id, isDeleted: 1 })}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-rose-600"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={addAccount} className="grid gap-3 sm:grid-cols-3">
            <Field label="New account" htmlFor="account-name">
              <Input
                id="account-name"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="e.g. Savings"
              />
            </Field>
            <Field label="Opening balance" htmlFor="account-opening">
              <Input
                id="account-opening"
                inputMode="decimal"
                className="tabular"
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
                placeholder="0.00"
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" data-testid="add-account">
                Add account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
