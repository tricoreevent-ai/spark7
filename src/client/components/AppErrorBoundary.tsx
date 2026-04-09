import React from 'react';

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'The application hit an unexpected error.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application render error:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-rose-400/20 bg-white/[0.04] p-8 shadow-[0_28px_80px_rgba(2,6,23,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">Application Error</p>
          <h1 className="mt-3 text-3xl font-bold">This page could not finish loading.</h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            {this.state.message || 'The application hit an unexpected error.'} Refresh the page once. If the same action
            keeps causing this screen, please note what you clicked just before it happened.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              Refresh Application
            </button>
          </div>
        </div>
      </div>
    );
  }
}
