import { cookies } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { DisplayForm } from "../forms";

export const metadata = { title: "Display" };

export default async function Page() {
  const jar = await cookies();
  return (
    <>
      <PageHeader title="Display" back />
      <DisplayForm theme={jar.get("theme")?.value ?? "system"} textSize={jar.get("textsize")?.value ?? "normal"} />
    </>
  );
}
