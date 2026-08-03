import type { Metadata } from "next";

import { AccountManager } from "@/components/settings/account-manager";
import { CategoryManager } from "@/components/settings/category-manager";
import { ProfileForm } from "@/components/settings/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { listAllAccounts } from "@/lib/data/accounts";
import { listAllCategories } from "@/lib/data/categories";
import { getFormatting, getProfile } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [profile, formatting, categories, accounts] = await Promise.all([
    getProfile(),
    getFormatting(),
    listAllCategories(),
    listAllAccounts(),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your currency and formatting, plus the categories and accounts everything else is built on."
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Changing the currency relabels existing figures; it does not convert them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Archiving keeps a category off your pickers while leaving past transactions labelled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryManager categories={categories} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Mark an account liquid if its balance should count toward your runway.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountManager
            accounts={accounts}
            defaultCurrency={formatting.currency}
            locale={formatting.locale}
          />
        </CardContent>
      </Card>

    </>
  );
}
