import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 20, fontFamily: "monospace", fontSize: 13, color: "#F87171",
          background: "#0B0F19", minHeight: "100vh", overflow: "auto",
        }}>
          <h2 style={{ marginBottom: 12 }}>Erreur d'affichage</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          {this.state.info?.componentStack && (
            <pre style={{ marginTop: 12, fontSize: 11, color: "#9CA3AF", whiteSpace: "pre-wrap" }}>
              {this.state.info.componentStack}
            </pre>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, info: null })}
            style={{
              marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(99,102,241,0.15)", color: "#818CF8", cursor: "pointer", fontSize: 12,
            }}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
