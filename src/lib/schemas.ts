/**
 * Validation schemas shared by client forms and server route handlers.
 *
 * One definition per shape, imported by both sides, so a form can never send a
 * payload the server rejects for a reason the form did not know about.
 */

import { z } from "zod";

import { DEFAULT_CURRENCY } from "@/lib/currency";
import { parseAmount } from "@/lib/money";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

const monthStart = isoDate.refine((value) => value.endsWith("-01"), {
  message: "Budget periods must be the first of a month",
});

/** Accepts "12.34", "1,234.5" or a number; yields integer minor units. */
export const amountMinor = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const minor = parseAmount(value);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
      return z.NEVER;
    }
    return minor;
  })
  .refine((minor) => minor > 0, "Amount must be greater than zero");

export const directionSchema = z.enum(["expense", "income"]);
export const incomeTypeSchema = z.enum(["active", "passive"]);
export const expenseNatureSchema = z.enum(["daily", "fixed", "recurring"]);
export const frequencySchema = z.enum(["weekly", "monthly", "quarterly", "yearly"]);
export const accountTypeSchema = z.enum(["cash", "bank", "credit", "brokerage", "other"]);
export const assetTypeSchema = z.enum(["cash", "investment", "property", "other"]);

/**
 * A transaction is either an expense with a nature, or income with a type.
 * The same rule is enforced by a CHECK constraint in 0001_schema.sql; this
 * version exists to give the form a readable error instead of a database one.
 */
export const transactionSchema = z
  .object({
    occurredOn: isoDate,
    amount: amountMinor,
    direction: directionSchema,
    incomeType: incomeTypeSchema.nullish(),
    expenseNature: expenseNatureSchema.nullish(),
    categoryId: z.uuid().nullish(),
    accountId: z.uuid().nullish(),
    merchant: z.string().trim().max(120).nullish(),
    note: z.string().trim().max(500).nullish(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    clientUuid: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.direction === "expense") {
      if (!value.expenseNature) {
        ctx.addIssue({
          code: "custom",
          path: ["expenseNature"],
          message: "Choose daily, fixed or recurring",
        });
      }
      if (value.incomeType) {
        ctx.addIssue({
          code: "custom",
          path: ["incomeType"],
          message: "Expenses do not have an income type",
        });
      }
    } else {
      if (!value.incomeType) {
        ctx.addIssue({
          code: "custom",
          path: ["incomeType"],
          message: "Choose active or passive",
        });
      }
      if (value.expenseNature) {
        ctx.addIssue({
          code: "custom",
          path: ["expenseNature"],
          message: "Income does not have an expense nature",
        });
      }
    }
  });

export type TransactionInput = z.infer<typeof transactionSchema>;

export const recurringRuleSchema = z
  .object({
    label: z.string().trim().min(1, "Give this rule a name").max(120),
    direction: directionSchema,
    incomeType: incomeTypeSchema.nullish(),
    expenseNature: z.enum(["fixed", "recurring"]).nullish(),
    categoryId: z.uuid().nullish(),
    accountId: z.uuid().nullish(),
    amount: amountMinor.nullish(),
    estimatedAmount: amountMinor.nullish(),
    frequency: frequencySchema.default("monthly"),
    intervalCount: z.coerce.number().int().min(1).max(12).default(1),
    dayOfMonth: z.coerce.number().int().min(1).max(31).nullish(),
    startDate: isoDate,
    endDate: isoDate.nullish(),
    isActive: z.boolean().default(true),
    note: z.string().trim().max(500).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.direction === "expense" && !value.expenseNature) {
      ctx.addIssue({
        code: "custom",
        path: ["expenseNature"],
        message: "Choose fixed or recurring",
      });
    }
    if (value.direction === "income" && !value.incomeType) {
      ctx.addIssue({
        code: "custom",
        path: ["incomeType"],
        message: "Choose active or passive",
      });
    }
    // A variable rule needs a forecast; everything else needs a real amount.
    if (value.expenseNature === "recurring") {
      if (!value.estimatedAmount) {
        ctx.addIssue({
          code: "custom",
          path: ["estimatedAmount"],
          message: "Estimate the usual amount so it can be forecast",
        });
      }
    } else if (!value.amount) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the amount" });
    }
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date cannot be before the start date",
      });
    }
  });

export type RecurringRuleInput = z.infer<typeof recurringRuleSchema>;

export const budgetSchema = z.object({
  categoryId: z.uuid().nullish(),
  periodMonth: monthStart,
  limitAmount: amountMinor,
  warnThresholdPct: z.coerce.number().int().min(1).max(100).default(80),
  rolloverEnabled: z.boolean().default(false),
});

export type BudgetInputPayload = z.infer<typeof budgetSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name the category").max(60),
  kind: z.enum(["expense", "income"]),
  icon: z.string().trim().max(40).nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2563eb")
    .default("#64748b"),
  parentId: z.uuid().nullish(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name the account").max(60),
  type: accountTypeSchema.default("bank"),
  currency: z.string().length(3).toUpperCase().default(DEFAULT_CURRENCY),
  openingBalance: z
    .union([z.string(), z.number()])
    .transform((value) => parseAmount(value) ?? 0)
    .default(0),
  isLiquid: z.boolean().default(true),
});

export const goalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetAmount: amountMinor,
  currentAmount: z
    .union([z.string(), z.number()])
    .transform((value) => parseAmount(value) ?? 0)
    .default(0),
  targetDate: isoDate.nullish(),
  accountId: z.uuid().nullish(),
  note: z.string().trim().max(500).nullish(),
});

export const debtSchema = z.object({
  name: z.string().trim().min(1).max(80),
  principal: amountMinor,
  remainingBalance: z
    .union([z.string(), z.number()])
    .transform((value) => parseAmount(value) ?? 0)
    .default(0),
  apr: z.coerce.number().min(0).max(200).default(0),
  minimumPayment: z
    .union([z.string(), z.number()])
    .transform((value) => parseAmount(value) ?? 0)
    .default(0),
  startDate: isoDate,
  termMonths: z.coerce.number().int().min(1).max(1200).nullish(),
  accountId: z.uuid().nullish(),
});

export const assetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: assetTypeSchema.default("investment"),
  value: amountMinor,
  currency: z.string().length(3).toUpperCase().default(DEFAULT_CURRENCY),
  asOf: isoDate,
  note: z.string().trim().max(500).nullish(),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).nullish(),
  baseCurrency: z.string().length(3).toUpperCase(),
  locale: z.string().min(2).max(20),
  timezone: z.string().min(1).max(60),
  monthStartDay: z.coerce.number().int().min(1).max(28).default(1),
});

/** Range picker used by the report and export screens. */
export const exportRangeSchema = z
  .object({
    from: monthStart,
    to: monthStart,
    format: z.enum(["excel", "pdf"]),
  })
  .refine((value) => value.from <= value.to, {
    path: ["to"],
    message: "The end month must not be before the start month",
  });

export type ExportRange = z.infer<typeof exportRangeSchema>;
