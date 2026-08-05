import type { Metadata } from "next";
import { PiggyBank, Trash2 } from "lucide-react";

import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { EntityField, EntityForm } from "@/components/wealth/entity-form";
import { NetWorthChart } from "@/components/wealth/net-worth-chart";
import { SnapshotButton } from "@/components/wealth/snapshot-button";
import { deleteAsset, saveAsset } from "@/lib/actions/wealth";
import { currencySymbol } from "@/lib/currency";
import { getFormatting } from "@/lib/data/profile";
import {
  listAccountBalances,
  listAssets,
  listDebts,
  listNetWorthSnapshots,
} from "@/lib/data/wealth";
import { formatDateLabel, todayIso } from "@/lib/date";
import { computeNetWorth, netWorthChange } from "@/lib/domain/net-worth";
import { formatMoney, formatPercent } from "@/lib/money";

export const metadata: Metadata = { title: "Net worth" };

const ASSET_TYPES = [
  { value: "investment", label: "Investment" },
  { value: "property", label: "Property" },
  { value: "cash", label: "Cash held elsewhere" },
  { value: "other", label: "Other" },
] as const;

export default async function NetWorthPage() {
  const [formatting, balances, assets, debts, snapshots] = await Promise.all([
    getFormatting(),
    listAccountBalances(),
    listAssets(),
    listDebts(),
    listNetWorthSnapshots(),
  ]);

  const today = todayIso(formatting.timezone);
  const symbol = currencySymbol(formatting.currency, formatting.locale);
  const money = (minor: number) => formatMoney(minor, formatting.currency, formatting.locale);

  const openDebts = debts.filter((debt) => !debt.isClosed);
  const breakdown = computeNetWorth({
    accountBalances: balances,
    assetValues: assets.map((asset) => asset.value),
    debtBalances: openDebts.map((debt) => debt.remainingBalance),
  });

  const change = netWorthChange(snapshots);
  const hasAnything = balances.length > 0 || assets.length > 0 || openDebts.length > 0;

  return (
    <>
      <PageHeader
        title="Net worth"
        description="Everything you own, less everything you owe."
        actions={<SnapshotButton />}
      />

      {!hasAnything ? (
        <EmptyState
          icon={PiggyBank}
          title="Nothing to add up yet"
          description="Your account balances count automatically. Add anything held outside them — a property, a holding you value yourself — below."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <StatTile
                hero
                label="Net worth"
                value={money(breakdown.netWorth)}
                delta={
                  change
                    ? {
                        text: change.ratio
                          ? `${formatPercent(Math.abs(change.ratio), formatting.locale)} since the first snapshot`
                          : `${money(Math.abs(change.absolute))} since the first snapshot`,
                        direction:
                          change.absolute > 0 ? "up" : change.absolute < 0 ? "down" : "flat",
                        isGood: change.absolute >= 0,
                      }
                    : null
                }
              />
            </div>
            <StatTile
              label="Assets"
              value={money(breakdown.totalAssets)}
              hint={`${money(breakdown.cashAndAccounts)} in accounts · ${money(breakdown.otherAssets)} elsewhere`}
            />
            <StatTile
              label="Liabilities"
              value={money(breakdown.totalLiabilities)}
              hint={`${openDebts.length} open ${openDebts.length === 1 ? "debt" : "debts"}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Over time</CardTitle>
              <CardDescription>
                {snapshots.length >= 2
                  ? "One point per snapshot. One is taken automatically each month."
                  : "Snapshots are taken automatically each month. Record one now to start the history."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {snapshots.length >= 2 ? (
                <NetWorthChart
                  points={snapshots}
                  currency={formatting.currency}
                  locale={formatting.locale}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Two snapshots are needed before there is a line to draw.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {assets.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Assets held outside your accounts</CardTitle>
            <CardDescription>
              Account balances are counted automatically — do not add them here as well, or they
              will count twice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {assets.map((asset) => (
                <li key={asset.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{asset.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ASSET_TYPES.find((type) => type.value === asset.type)?.label} · valued{" "}
                      {formatDateLabel(asset.asOf, formatting.locale)}
                    </p>
                  </div>
                  <span className="tabular text-sm font-medium">{money(asset.value)}</span>
                  <form action={deleteAsset}>
                    <input type="hidden" name="id" value={asset.id} />
                    <button
                      type="submit"
                      aria-label={`Delete ${asset.name}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-rose-600"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add an asset</CardTitle>
          <CardDescription>
            Something you own that does not flow through one of your accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityForm action={saveAsset} submitLabel="Add asset">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <EntityField name="name" label="Name" htmlFor="asset-name">
                <Input id="asset-name" name="name" required placeholder="e.g. Flat" />
              </EntityField>

              <EntityField name="type" label="Type" htmlFor="asset-type">
                <Select id="asset-type" name="type" defaultValue="investment">
                  {ASSET_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </EntityField>

              <EntityField name="value" label="Value" htmlFor="asset-value">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    id="asset-value"
                    name="value"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    className="pl-9 tabular"
                  />
                </div>
              </EntityField>

              <EntityField
                name="asOf"
                label="Valued on"
                htmlFor="asset-asof"
                hint="When this figure was accurate."
              >
                <Input id="asset-asof" name="asOf" type="date" required defaultValue={today} />
              </EntityField>
            </div>
          </EntityForm>
        </CardContent>
      </Card>
    </>
  );
}
