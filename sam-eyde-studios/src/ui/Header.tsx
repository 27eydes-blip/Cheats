import { useEffect, useState } from "react";
import { KEY_NAMES, SCALE_ORDER, SCALES } from "../autotune/scales";
import { updateProject, useStore } from "../state/store";
import type { ScaleId } from "../types";
import { clamp } from "../util";
import { IconMinus, IconPlus } from "./Icons";
import { Logo } from "./Logo";

function BpmControl({ bpm }: { bpm: number }) {
  const [text, setText] = useState(String(bpm));
  useEffect(() => setText(String(bpm)), [bpm]);
  const commit = (v: number) => {
    const next = clamp(Math.round(Number.isFinite(v) ? v : bpm), 40, 240);
    setText(String(next));
    if (next !== bpm) updateProject({ bpm: next });
  };
  return (
    <div className="field bpm">
      <span className="field-label">BPM</span>
      <div className="stepper">
        <button type="button" aria-label="Slower" onClick={() => commit(bpm - 1)}>
          <IconMinus />
        </button>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="BPM"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          onBlur={() => commit(Number(text))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <button type="button" aria-label="Faster" onClick={() => commit(bpm + 1)}>
          <IconPlus />
        </button>
      </div>
    </div>
  );
}

export function Header({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  const project = useStore((s) => s.project);
  if (!project) return null;
  return (
    <header className="header">
      <div className="header-top">
        {left}
        <Logo compact />
        <span className="spacer" />
        {right}
      </div>
      <input
        className="project-name"
        value={project.name}
        aria-label="Project name"
        placeholder="Project name"
        maxLength={60}
        onChange={(e) => updateProject({ name: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <div className="header-fields">
        <BpmControl bpm={project.bpm} />
        <label className="field key">
          <span className="field-label">Key</span>
          <select
            value={project.key}
            aria-label="Key"
            onChange={(e) => updateProject({ key: Number(e.target.value) })}
          >
            {KEY_NAMES.map((k, i) => (
              <option key={k} value={i}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="field scale">
          <span className="field-label">Scale</span>
          <select
            value={project.scale}
            aria-label="Scale"
            onChange={(e) => updateProject({ scale: e.target.value as ScaleId })}
          >
            {SCALE_ORDER.map((id) => (
              <option key={id} value={id}>
                {SCALES[id].name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
