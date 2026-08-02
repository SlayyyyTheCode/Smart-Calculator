import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  FileDown,
  LayoutDashboard,
  Landmark,
  PiggyBank,
  Plus,
  Repeat,
  Settings,
  Target,
  Upload,
  Wallet,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Short label for the mobile tab bar, where space is tight. */
  shortLabel?: string;
  description: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/** Sidebar structure. The mobile tab bar picks a subset of these by href. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        shortLabel: "Home",
        icon: LayoutDashboard,
        description: "Spending, income and budget warnings at a glance",
      },
      {
        href: "/reports",
        label: "Reports & export",
        shortLabel: "Reports",
        icon: FileDown,
        description: "Export to Excel or PDF",
      },
    ],
  },
  {
    title: "Money in and out",
    items: [
      {
        href: "/quick-add",
        label: "Quick add",
        shortLabel: "Add",
        icon: Plus,
        description: "Record an expense in two taps, even offline",
      },
      {
        href: "/transactions",
        label: "Transactions",
        shortLabel: "History",
        icon: ArrowLeftRight,
        description: "Everything you have recorded, filtered any way you like",
      },
      {
        href: "/recurring",
        label: "Fixed & recurring",
        shortLabel: "Repeat",
        icon: Repeat,
        description: "Monthly commitments, split into fixed and variable",
      },
      {
        href: "/income",
        label: "Income",
        icon: Banknote,
        description: "Active salary against passive dividends and coupons",
      },
    ],
  },
  {
    title: "Planning",
    items: [
      {
        href: "/budgets",
        label: "Budgets",
        icon: Wallet,
        description: "Set monthly caps and get warned before you break them",
      },
      {
        href: "/goals",
        label: "Goals",
        icon: Target,
        description: "Save toward a target by a date",
      },
      {
        href: "/debts",
        label: "Debts",
        icon: Landmark,
        description: "Loans, interest and payoff timelines",
      },
      {
        href: "/net-worth",
        label: "Net worth",
        icon: PiggyBank,
        description: "Assets minus liabilities over time",
      },
    ],
  },
  {
    title: "Data",
    items: [
      {
        href: "/import",
        label: "Import CSV",
        icon: Upload,
        description: "Bring in a bank or broker statement",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        description: "Categories, accounts, currency and alert thresholds",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** The five destinations that fit a phone tab bar. */
export const MOBILE_NAV_HREFS = [
  "/dashboard",
  "/transactions",
  "/quick-add",
  "/budgets",
  "/settings",
] as const;

export const MOBILE_NAV_ITEMS: NavItem[] = MOBILE_NAV_HREFS.map(
  (href) => NAV_ITEMS.find((item) => item.href === href)!,
);

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
