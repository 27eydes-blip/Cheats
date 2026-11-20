/** Re-mounts on every navigation: a short slide like turning a page. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
