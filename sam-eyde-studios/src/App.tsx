import { useEffect, useState } from "react";
import { getState, newProject, setState, useStore } from "./state/store";
import { startAudio } from "./studio/controller";
import { ExportSheet } from "./ui/ExportSheet";
import { IconExport } from "./ui/Icons";
import { Studio } from "./ui/Studio";

export function App() {
  const project = useStore((s) => s.project);
  const toastText = useStore((s) => s.ui.toast);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!getState().project) {
      setState({ ...getState(), screen: "studio", project: newProject("My First Song") });
    }
    // iOS: the AudioContext may only start inside a user gesture — arm it on the first tap.
    const arm = () => startAudio();
    window.addEventListener("touchend", arm, { passive: true });
    window.addEventListener("click", arm);
    return () => {
      window.removeEventListener("touchend", arm);
      window.removeEventListener("click", arm);
    };
  }, []);

  return (
    <>
      {project && (
        <Studio
          headerRight={
            <button type="button" className="icon-btn" aria-label="Export" onClick={() => setExporting(true)}>
              <IconExport />
            </button>
          }
        />
      )}
      {exporting && <ExportSheet onClose={() => setExporting(false)} />}
      {toastText && (
        <div className="toast" role="alert">
          {toastText}
        </div>
      )}
    </>
  );
}
