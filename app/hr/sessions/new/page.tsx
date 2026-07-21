import { redirect } from "next/navigation";

/** Creation now lives in a modal on the sessions list; old bookmarks land there. */
export default function HrSessionNewPage() {
  redirect("/hr/sessions");
}
