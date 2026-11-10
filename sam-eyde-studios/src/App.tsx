import { useEffect, useState } from "react";
import { useStore } from "./state/store";
import { startAudio } from "./studio/controller";
import { closeProject } from "./studio/session";
import { ExportSheet } from "./ui/ExportSheet";
import { IconBack, IconExport } from "./ui/Icons";
import { ProjectList } from "./ui/ProjectList";
import { Studio } from "./ui/Studio";

export function App() {
  const screen = useStore((s) => s.screen);
  const project = useStore((s) => s.project);
  const toastText = useStore((s) => s.ui.toast);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
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
      {screen === "studio" && project ? (
        <Studio
          headerLeft={
            <button type="button" className="icon-btn" aria-label="Back to projects" onClick={() => void closeProject()}>
              <IconBack />
            </button>
          }
          headerRight={
            <button type="button" className="icon-btn" aria-label="Export" onClick={() => setExporting(true)}>
              <IconExport />
            </button>
          }
        />
      ) : (
        <ProjectList />
      )}
      {exporting && screen === "studio" && <ExportSheet onClose={() => setExporting(false)} />}
      {toastText && (
        <div className="toast" role="alert">
          {toastText}
        </div>
      )}
    </>
  );
}
