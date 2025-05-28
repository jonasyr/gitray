# Documentation Structure

docs/
├── TECHNOLOGIES.md # Überblick aller Technologien und Konventionen
├── STRUCTURE.md # Diese Datei: Dokumentations‑Plan
├── root-config.md # Root‑Level Configs: package.json, ESLint, Prettier, Workspace
├── shared-types.md # Shared‑Types Package: Interfaces & Build
├── frontend/
│ ├── configuration.md # Frontend‑Setup: Vite, Tailwind, TS, ESLint
│ └── components.md # Frontend‑Komponenten: App, Main, CSS
└── backend/
├── api.md # API‑Setup: Express, Routes
├── services.md # Business‑Logic: GitService
└── middlewares.md # Middleware: Error Handling, CORS

Jede Datei behandelt:

- **Zweck** des Ordners / der Datei
- **Inhalt & Verantwortlichkeiten**
- **Wichtige Funktionen & Variablen**
- **Abhängigkeiten**
- (Optional) Diagramme / Flowcharts für komplexe Abläufe
- Kommentare im Code beachten; Tests nach dem Arrange–Act–Assert-Muster schreiben
