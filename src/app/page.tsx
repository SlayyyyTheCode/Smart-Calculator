import { redirect } from "next/navigation";

/** The app has no marketing page; the dashboard is the front door. */
export default function Home() {
  redirect("/dashboard");
}
