import { Component, type ReactNode } from "react";
import { Logo } from "./Logo";

/** If something unexpected breaks, show a calm screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="projects crash">
        <Logo />
        <p className="projects-empty">
          Something went wrong on this screen. Your projects are saved on this device — reload to carry on.
        </p>
        <button type="button" className="btn primary big block" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
