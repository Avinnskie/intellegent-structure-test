import { redirect } from "next/navigation";

/** The public root is the participant entry. HR and admin get there via their own login routes. */
export default function Home() {
  redirect("/test");
}
