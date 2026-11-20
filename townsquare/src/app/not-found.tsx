import { EmptyState } from "@/components/ui/States";

export default function NotFound() {
  return <EmptyState art="search" title="This page isn't here" body="It may have been removed, or the link is off by a character." action={{ label: "Back to Home", href: "/" }} />;
}
