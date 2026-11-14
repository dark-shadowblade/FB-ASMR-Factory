import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ASMR Factory renderer crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: "100vh", padding: 32, background: "#0b0d12", color: "#f4f5f7", fontFamily: "Segoe UI, sans-serif" }}>
          <h1>ASMR Factory could not load</h1>
          <p>The interface encountered an unexpected error. Copy the details below and share them with support.</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 16, background: "#171b25", borderRadius: 8, color: "#ffb4a9" }}>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 16px", cursor: "pointer" }}>Reload app</button>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) {
  document.body.innerHTML = "<pre style='color:white;background:#0b0d12;padding:24px'>ASMR Factory startup error: root element #root was not found.</pre>";
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>
  );
}
