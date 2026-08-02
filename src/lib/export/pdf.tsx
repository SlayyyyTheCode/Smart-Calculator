import "server-only";

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ExportMonth, ExportPayload } from "@/lib/data/export";
import { formatDateLabel, formatMonthLabel } from "@/lib/date";
import { describeBudget } from "@/lib/domain/budget";
import { fireCoverage, savingsRate } from "@/lib/domain/metrics";
import { formatMoney, formatPercent } from "@/lib/money";
import { computeMonth, transactionTypeLabel } from "@/lib/export/shared";

/**
 * Print colours, fixed rather than themed: a PDF has one appearance and it is
 * always on white. These are the light-mode steps of the same palette the app
 * uses on screen.
 */
/**
 * Turn off hyphenation. react-pdf splits words at the line end by default,
 * which turns "passive" into "pas-sive" in a narrow column — it reads as a
 * rendering fault rather than typesetting. Wrapping whole words is better in
 * every case here.
 */
Font.registerHyphenationCallback((word) => [word]);

const INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  rule: "#e1e0d9",
  emphasis: "#2a78d6",
  context: "#d6dae1",
  good: "#15803d",
  warning: "#b45309",
  bad: "#b91c1c",
};

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 40, fontSize: 9, color: INK.primary },
  title: { fontSize: 18, fontWeight: 700 },
  subtitle: { fontSize: 10, color: INK.secondary, marginTop: 2 },
  meta: { fontSize: 8, color: INK.muted, marginTop: 2 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginTop: 18, marginBottom: 6 },
  note: { fontSize: 8, color: INK.muted, marginTop: 4 },

  kpiRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  kpi: { flex: 1, borderWidth: 1, borderColor: INK.rule, borderRadius: 4, padding: 8 },
  kpiLabel: { fontSize: 7, color: INK.muted, textTransform: "uppercase" },
  kpiValue: { fontSize: 13, fontWeight: 700, marginTop: 3 },
  kpiHint: { fontSize: 7, color: INK.muted, marginTop: 2 },

  barRow: { marginBottom: 6 },
  barHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  barTrack: { height: 5, backgroundColor: "#f2f3f5", borderRadius: 2 },
  barFill: { height: 5, borderRadius: 2 },

  table: { marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK.rule, paddingVertical: 3 },
  th: { fontSize: 7, color: INK.muted, textTransform: "uppercase", fontWeight: 700 },
  cell: { fontSize: 8 },
  right: { textAlign: "right" },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: INK.muted,
  },
});

/** Transaction table column widths, as flex ratios. */
const COLUMNS = { date: 1.5, type: 1.6, category: 1.8, merchant: 2.2, amount: 1.3, status: 1.1 };

function Kpi({
  label,
  value,
  hint,
  hintTwo,
}: {
  label: string;
  value: string;
  hint?: string;
  /** A second hint line. Two short lines beat one that wraps mid-phrase. */
  hintTwo?: string;
}) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
      {hintTwo ? <Text style={styles.kpiHint}>{hintTwo}</Text> : null}
    </View>
  );
}

function MonthSection({
  month,
  payload,
  isFirst,
}: {
  month: ExportMonth;
  payload: ExportPayload;
  isFirst: boolean;
}) {
  const { currency, locale } = payload;
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const computed = computeMonth(month);

  const rate = savingsRate(computed.confirmedIncome, computed.confirmedExpense);
  const coverage = fireCoverage(month.totals.incomePassive, computed.confirmedExpense);

  const topCategories = month.categorySpend.slice(0, 8);
  const maxCategory = topCategories[0]?.amount ?? 0;
  const categoryTotal = month.categorySpend.reduce((sum, item) => sum + item.amount, 0);

  const warnings = month.budgets.filter((budget) => budget.evaluation.level !== "ok");

  return (
    <View break={!isFirst}>
      <Text style={styles.title}>{formatMonthLabel(month.periodMonth, locale)}</Text>
      <Text style={styles.subtitle}>
        {payload.displayName ? `${payload.displayName} · ` : ""}Smart Planner
      </Text>

      <View style={styles.kpiRow}>
        <Kpi label="Spent" value={money(computed.confirmedExpense)} />
        <Kpi
          label="Income"
          value={money(computed.confirmedIncome)}
          hint={`${money(month.totals.incomeActive)} active`}
          hintTwo={`${money(month.totals.incomePassive)} passive`}
        />
        <Kpi label="Net" value={money(computed.net)} />
        <Kpi
          label="Savings rate"
          value={rate === null ? "—" : formatPercent(rate, locale)}
        />
        <Kpi
          label="FIRE coverage"
          value={coverage === null ? "—" : formatPercent(coverage, locale)}
          hint="passive vs spend"
        />
      </View>

      {month.budgets.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            Budgets{warnings.length > 0 ? ` · ${warnings.length} needing attention` : ""}
          </Text>
          <View style={styles.table}>
            <View style={styles.tr}>
              <Text style={[styles.th, { flex: 2.4 }]}>Category</Text>
              <Text style={[styles.th, styles.right, { flex: 1.3 }]}>Budget</Text>
              <Text style={[styles.th, styles.right, { flex: 1.3 }]}>Spent</Text>
              <Text style={[styles.th, styles.right, { flex: 1.3 }]}>Remaining</Text>
              <Text style={[styles.th, styles.right, { flex: 0.9 }]}>Used</Text>
              <Text style={[styles.th, styles.right, { flex: 1.4 }]}>Status</Text>
            </View>
            {month.budgets.map((budget) => {
              const { evaluation } = budget;
              const colour =
                evaluation.level === "exceeded"
                  ? INK.bad
                  : evaluation.level === "warning"
                    ? INK.warning
                    : INK.good;

              return (
                <View style={styles.tr} key={budget.budgetId}>
                  <Text style={[styles.cell, { flex: 2.4 }]}>{budget.categoryName}</Text>
                  <Text style={[styles.cell, styles.right, { flex: 1.3 }]}>
                    {money(evaluation.limit)}
                  </Text>
                  <Text style={[styles.cell, styles.right, { flex: 1.3 }]}>
                    {money(evaluation.spent)}
                  </Text>
                  <Text style={[styles.cell, styles.right, { flex: 1.3 }]}>
                    {money(evaluation.remaining)}
                  </Text>
                  {/* One string, not two nodes: react-pdf lays adjacent text
                      children out separately, which shows up as "138 %". */}
                  <Text style={[styles.cell, styles.right, { flex: 0.9 }]}>
                    {`${Math.round(evaluation.pctUsed)}%`}
                  </Text>
                  {/* Status is a word, not just a colour, so it survives a
                      greyscale print. */}
                  <Text style={[styles.cell, styles.right, { flex: 1.4, color: colour }]}>
                    {describeBudget(evaluation)}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {topCategories.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Where the money went</Text>
          {topCategories.map((category, index) => (
            <View style={styles.barRow} key={category.categoryId ?? category.categoryName}>
              <View style={styles.barHeader}>
                <Text style={styles.cell}>{category.categoryName}</Text>
                <Text style={styles.cell}>
                  {categoryTotal > 0
                    ? `${money(category.amount)}   ${formatPercent(category.amount / categoryTotal, locale)}`
                    : money(category.amount)}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      // Emphasis: the largest category, then context.
                      backgroundColor: index === 0 ? INK.emphasis : INK.context,
                      width: `${maxCategory > 0 ? Math.max((category.amount / maxCategory) * 100, 1) : 0}%`,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Transactions</Text>
      {month.transactions.length === 0 ? (
        <Text style={styles.note}>Nothing recorded this month.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tr} fixed>
            <Text style={[styles.th, { flex: COLUMNS.date }]}>Date</Text>
            <Text style={[styles.th, { flex: COLUMNS.type }]}>Type</Text>
            <Text style={[styles.th, { flex: COLUMNS.category }]}>Category</Text>
            <Text style={[styles.th, { flex: COLUMNS.merchant }]}>Merchant</Text>
            <Text style={[styles.th, styles.right, { flex: COLUMNS.amount }]}>Amount</Text>
            <Text style={[styles.th, styles.right, { flex: COLUMNS.status }]}>Status</Text>
          </View>
          {month.transactions.map((transaction) => (
            <View style={styles.tr} key={transaction.id} wrap={false}>
              <Text style={[styles.cell, { flex: COLUMNS.date }]}>
                {formatDateLabel(transaction.occurredOn, locale)}
              </Text>
              <Text style={[styles.cell, { flex: COLUMNS.type }]}>
                {transactionTypeLabel(transaction)}
              </Text>
              <Text style={[styles.cell, { flex: COLUMNS.category }]}>
                {transaction.categoryName ?? "Uncategorised"}
              </Text>
              <Text style={[styles.cell, { flex: COLUMNS.merchant }]}>
                {transaction.merchant ?? ""}
              </Text>
              <Text style={[styles.cell, styles.right, { flex: COLUMNS.amount }]}>
                {transaction.direction === "income" ? "+" : "-"}
                {money(transaction.amount)}
              </Text>
              <Text
                style={[
                  styles.cell,
                  styles.right,
                  { flex: COLUMNS.status, color: transaction.status === "draft" ? INK.warning : INK.muted },
                ]}
              >
                {transaction.status === "draft" ? "Draft" : ""}
              </Text>
            </View>
          ))}
        </View>
      )}

      {computed.draftCount > 0 ? (
        <Text style={styles.note}>
          {computed.draftCount} draft {computed.draftCount === 1 ? "entry" : "entries"} totalling{" "}
          {money(computed.draftTotal)} are listed above but excluded from every total, because
          their real amounts have not been confirmed yet.
        </Text>
      ) : null}
    </View>
  );
}

function Report({ payload }: { payload: ExportPayload }) {
  const generated = new Date(payload.generatedAt).toISOString().slice(0, 16).replace("T", " ");

  return (
    <Document
      title={`Smart Planner ${payload.from.slice(0, 7)} to ${payload.to.slice(0, 7)}`}
      author="Smart Planner"
    >
      <Page size="A4" style={styles.page}>
        {payload.months.map((month, index) => (
          <MonthSection
            key={month.periodMonth}
            month={month}
            payload={payload}
            isFirst={index === 0}
          />
        ))}

        <View style={styles.footer} fixed>
          <Text>Generated {generated} UTC · totals exclude unconfirmed drafts</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function buildPdf(payload: ExportPayload): Promise<Buffer> {
  return renderToBuffer(<Report payload={payload} />);
}
