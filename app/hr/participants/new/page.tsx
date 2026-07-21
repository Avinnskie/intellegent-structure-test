import { redirect } from "next/navigation";

/** Creation now lives in a modal on the list page; old bookmarks land there. */
export default function HrParticipantNewPage() {
  redirect("/hr/participants");
}
