import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Client error boundary caught an error.", error, errorInfo);
  }

  private reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-shell">
          <h1>Something went off course.</h1>
          <p>The app hit an unexpected client-side error. Reloading usually gets us back on track.</p>
          <button className="primary-button" onClick={this.reset} type="button">
            Try again
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
