import { redirect } from "next/navigation";

export default function Home() {
  redirect("/prototype/dictionary?variant=A");
}
