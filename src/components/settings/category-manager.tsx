"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArchiveRestore, Archive, Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { createCategory, renameCategory, setCategoryArchived } from "@/lib/actions/categories";
import { IDLE } from "@/lib/actions/result";
import type { CategoryOption } from "@/lib/data/categories";
import { cn } from "@/lib/utils";
import type { CategoryKind } from "@/types/database";

const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
  "#64748b",
];

export function CategoryManager({ categories }: { categories: CategoryOption[] }) {
  const [state, formAction, isPending] = useActionState(createCategory, IDLE);
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [color, setColor] = useState(PALETTE[7]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  const errors = state.fieldErrors ?? {};
  const active = categories.filter((category) => !category.isArchived);
  const archived = categories.filter((category) => category.isArchived);

  return (
    <div className="space-y-5">
      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="color" value={color} />

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Field label="New category" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" placeholder="e.g. Coffee" required />
          </Field>

          <Field label="Applies to" htmlFor="kind" error={errors.kind}>
            <Select
              id="kind"
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as CategoryKind)}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>

          <div className="flex items-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>

        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Colour</legend>
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-label={`Use colour ${swatch}`}
              aria-pressed={color === swatch}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-surface transition",
                color === swatch && "ring-2 ring-accent",
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </fieldset>

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
      </form>

      {(["expense", "income"] as const).map((group) => {
        const list = active.filter((category) => category.kind === group);
        if (list.length === 0) return null;

        return (
          <section key={group}>
            <h3 className="pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {list.map((category) =>
                editingId === category.id ? (
                  <li key={category.id} className="p-2">
                    <EditCategoryRow
                      category={category}
                      onDone={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <li key={category.id} className="flex items-center gap-2.5 px-3 py-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: category.color }}
                      aria-hidden
                    />
                    <span className="flex-1 text-sm">{category.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditingId(category.id)}
                      aria-label={`Edit ${category.name}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <form action={setCategoryArchived}>
                      <input type="hidden" name="id" value={category.id} />
                      <input type="hidden" name="archived" value="true" />
                      <button
                        type="submit"
                        aria-label={`Archive ${category.name}`}
                        title="Archive. Past transactions keep this label."
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                      >
                        <Archive className="size-4" aria-hidden />
                      </button>
                    </form>
                  </li>
                ),
              )}
            </ul>
          </section>
        );
      })}

      {archived.length > 0 ? (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
            {archived.length} archived
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {archived.map((category) => (
              <li key={category.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className="flex-1 text-sm text-muted-foreground">{category.name}</span>
                <form action={setCategoryArchived}>
                  <input type="hidden" name="id" value={category.id} />
                  <input type="hidden" name="archived" value="false" />
                  <button
                    type="submit"
                    aria-label={`Restore ${category.name}`}
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

function EditCategoryRow({
  category,
  onDone,
}: {
  category: CategoryOption;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(renameCategory, IDLE);
  const [color, setColor] = useState(category.color);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state.status, onDone]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={category.id} />
      <input type="hidden" name="color" value={color} />

      <Input
        name="name"
        defaultValue={category.name}
        aria-label="Category name"
        className="h-9 flex-1"
        required
      />

      <div className="flex items-center gap-1">
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => setColor(swatch)}
            aria-label={`Use colour ${swatch}`}
            aria-pressed={color === swatch}
            className={cn(
              "size-5 rounded-full ring-offset-2 ring-offset-surface transition",
              color === swatch && "ring-2 ring-accent",
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>

      <Button type="submit" size="sm" disabled={isPending} aria-label="Save category">
        <Check aria-hidden />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone} aria-label="Cancel">
        <X aria-hidden />
      </Button>

      {state.status === "error" && state.message ? (
        <p className="w-full text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
      ) : null}
    </form>
  );
}
