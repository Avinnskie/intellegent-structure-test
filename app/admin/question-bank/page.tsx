import { redirect } from "next/navigation";

/** The portals are unified: question bank management lives at /hr/question-bank for both roles. */
export default function AdminQuestionBankPage() {
  redirect("/hr/question-bank");
}
