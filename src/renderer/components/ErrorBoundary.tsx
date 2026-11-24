import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected visual issue occurred.',
    };
  }

  private handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-canvas p-6 text-ink">
          <div className="max-w-md rounded-2xl border border-hairline bg-surface p-8 shadow-float">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-warn-soft text-warn">
              <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <h1 className="text-xl font-semibold text-ink">AuraDesk hit a snag</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              Your conversations, memories, and documents are safely saved on your computer. Reloading the window will get things right back on track.
            </p>
            {this.state.errorMessage && (
              <p className="mt-3 rounded-lg bg-subtle px-3 py-2 text-xs text-ink-muted">
                {this.state.errorMessage}
              </p>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="tactile-press mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-hover"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
