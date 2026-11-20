import { Frame } from "@/components/ui/Frame";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { DisplayForm } from "../forms";

export const metadata = { title: "Display" };

export default async function Page() {
  const jar = await cookies();
  return (
    <Frame>
      <PageHeader title="Display" back compact />
      <DisplayForm theme={jar.get("theme")?.value ?? "system"} textSize={jar.get("textsize")?.value ?? "normal"} />
    </Frame>
  );
}
