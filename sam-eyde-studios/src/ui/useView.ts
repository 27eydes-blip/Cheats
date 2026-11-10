import { useStore } from "../state/store";
import { computeView, projectDuration, type View } from "../studio/timeline";

export function useView(): View & { width: number } {
  const project = useStore((s) => s.project);
  const zoom = useStore((s) => s.ui.zoom);
  const scrollSec = useStore((s) => s.ui.scrollSec);
  const laneWidth = useStore((s) => s.ui.laneWidth);
  const minViewSec = useStore((s) => s.ui.minViewSec);
  const view = computeView(projectDuration(project), minViewSec, laneWidth, zoom, scrollSec);
  return { ...view, width: laneWidth };
}
