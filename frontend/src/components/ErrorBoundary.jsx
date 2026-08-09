import React from 'react';

/**
 * Top-level error boundary.
 *
 * There was no boundary anywhere in the tree, so any render-time throw took the
 * whole app to a blank white screen with no indication of what happened.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <h2>⚠️ Something went wrong</h2>
        <p>The interface hit an unexpected error and stopped rendering.</p>
        <pre className="error-boundary-detail">{String(this.state.error?.message || this.state.error)}</pre>
        <div className="error-boundary-actions">
          <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
            Try Again
          </button>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload App
          </button>
        </div>
      </div>
    );
  }
}
