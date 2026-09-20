// A renderer fault shows what happened and a way back, instead of a blank window.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; /** Shown in the message: "the Presets page", "Hiltwright". */ what: string; onReset?: () => void }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.log(`[renderer] ${this.props.what} crashed: ${error.stack ?? String(error)}\n${info.componentStack ?? ''}`);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="panel" role="alert" style={{ margin: 24 }}>
        <div className="ph"><h2>Something went wrong in {this.props.what}</h2></div>
        <div className="pb col" style={{ gap: 12 }}>
          <p className="dim" style={{ margin: 0, fontSize: 13 }}>Nothing was written to the saber by this error. The saber stays connected; you can try again or reload the window.</p>
          <pre className="console" style={{ margin: 0, maxHeight: 160, whiteSpace: 'pre-wrap' }}>{error.message}</pre>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn pri" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}><span className="b"><span className="i">Try again</span></span></button>
            <button type="button" className="btn" onClick={() => window.location.reload()}><span className="b"><span className="i">Reload the window</span></span></button>
          </div>
        </div>
      </section>
    );
  }
}
