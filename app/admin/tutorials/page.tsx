import { redirect } from "next/navigation";

/** The portals are unified: tutorial management lives at /hr/tutorials for both roles. */
export default function AdminTutorialsPage() {
  redirect("/hr/tutorials");
}
