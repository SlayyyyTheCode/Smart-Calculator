"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { formatMonthLabel } from "@/lib/date";

type ExportFormProps = {
  /** Selectable months, newest first. */
  months: string[];
  defaultFrom: string;
  defaultTo: string;
  locale: string;
};

/**
 * Picks a range and links straight at the export routes.
 *
 * Plain anchors rather than fetch-and-blob: the browser's own download handling
 * is better than anything reimplemented here, it works with the middle-click
 * and right-click menus, and there is no in-memory copy of a large file.
 */
export function ExportForm({ months, defaultFrom, defaultTo, locale }: ExportFormProps) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const backwards = from > to;
  const monthCount = backwards ? 0 : countMonths(from, to);
  const query = `from=${from}&to=${to}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="from">
          <Select id="from" value={from} onChange={(event) => setFrom(event.target.value)}>
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonthLabel(month, locale)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="To"
          htmlFor="to"
          error={backwards ? "The end month must not be before the start month." : undefined}
        >
          <Select
            id="to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-invalid={backwards}
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonthLabel(month, locale)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!backwards ? (
        <p className="text-sm text-muted-foreground">
          {monthCount} {monthCount === 1 ? "month" : "months"} selected.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {backwards ? (
          <>
            <Button disabled>
              <FileSpreadsheet aria-hidden />
              Download Excel
            </Button>
            <Button variant="outline" disabled>
              <FileText aria-hidden />
              Download PDF
            </Button>
          </>
        ) : (
          <>
            <a href={`/api/export/excel?${query}`} download>
              <Button type="button">
                <FileSpreadsheet aria-hidden />
                Download Excel
              </Button>
            </a>
            <a href={`/api/export/pdf?${query}`} download>
              <Button type="button" variant="outline">
                <FileText aria-hidden />
                Download PDF
              </Button>
            </a>
          </>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Download className="size-3" aria-hidden />
        Large ranges take a few seconds to build.
      </p>
    </div>
  );
}

function countMonths(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
}
