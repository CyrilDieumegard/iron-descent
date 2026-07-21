import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const appName = "Iron Descent";

function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">LocalClaw Preview</p>
        <h1>{appName}</h1>
        <p>Start editing this app with OpenClaw. The preview updates from this project folder.</p>
        <div className="actions">
          <button>Primary action</button>
          <button className="secondary">Secondary</button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);