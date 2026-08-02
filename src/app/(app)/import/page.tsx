import type { Metadata } from "next";
import { Undo2 } from "lucide-react";

import { ImportWizard } from "@/components/import/import-wizard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { revertImport } from "@/lib/actions/import";
import { listAccounts } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/categories";
import { listImportBatches } from "@/lib/data/imports";
import { getFormatting } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Import CSV" };

export default async function ImportPage() {
  const [formatting, categories, accounts, batches] = await Promise.all([
    getFormatting(),
    listCategories(),
    listAccounts(),
    listImportBatches(),
  ]);

  return (
    <>
      <PageHeader
        title="Import CSV"
        description="Bring in a bank or broker statement instead of typing it out."
      />

      <Card>
        <CardHeader>
          <CardTitle>Import a file</CardTitle>
          <CardDescription>
            Your file is read in the browser. Nothing is saved until you have seen the preview and
            confirmed it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportWizard
            categories={categories}
            accounts={accounts}
            currency={formatting.currency}
            locale={formatting.locale}
          />
        </CardContent>
      </Card>

      {batches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Previous imports</CardTitle>
            <CardDescription>
              Reverting removes only the entries that import created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {batches.map((batch) => (
                <li key={batch.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{batch.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(batch.createdAt).toLocaleString(formatting.locale)} ·{" "}
                      {batch.rowCount} {batch.rowCount === 1 ? "entry" : "entries"}
                      {batch.status === "committed" && batch.remaining !== batch.rowCount
                        ? ` · ${batch.remaining} still present`
                        : ""}
                    </p>
                  </div>

                  {batch.status === "reverted" ? (
                    <Badge>Reverted</Badge>
                  ) : batch.remaining === 0 ? (
                    <Badge>Nothing left</Badge>
                  ) : (
                    <form action={revertImport}>
                      <input type="hidden" name="id" value={batch.id} />
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-rose-600 hover:bg-surface-muted dark:text-rose-400"
                      >
                        <Undo2 className="size-4" aria-hidden />
                        Revert
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
