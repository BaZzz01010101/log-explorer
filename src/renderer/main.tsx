import React from "react";
import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App";
import { installScopedEditHistory } from "./scoped-edit-history";

const disposeEditHistory = installScopedEditHistory(document);
import.meta.hot?.dispose(disposeEditHistory);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <div
          style={{
            padding: 32,
            color: "#e5e7eb",
            background: "#121a25",
            minHeight: "100vh",
            fontFamily: "Segoe UI, sans-serif",
          }}
        >
          <h1>Unable to display the workspace</h1>
          <p>{this.state.error}</p>
          <button onClick={() => location.reload()}>
            Reload the application
          </button>
        </div>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
