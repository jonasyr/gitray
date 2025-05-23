# README.md

## Build & Run

Install Dependencies

```bash
pnpm install
```

Build the Project

```bash
pnpm run build
```

Run the Application

```bash
pnpm run dev
```

## Scripts Overview

- **`pnpm run dev`**: Runs the frontend and backend in development mode.
- **`pnpm run dev:frontend`**: Runs only the frontend in development mode.
- **`pnpm run dev:backend`**: Runs only the backend in development mode.
- **`pnpm run build`**: Builds the shared types, backend, and frontend.
- **`pnpm run test`**: Runs all tests.
- **`pnpm run test:frontend`**: Runs tests for the frontend only.
- **`pnpm run test:backend`**: Runs tests for the backend only.
- **`pnpm run test:watch`**: Runs tests in watch mode.
- **`pnpm run test:coverage`**: Runs tests and generates a coverage report.
- **`pnpm run lint`**: Lints all JavaScript/TypeScript files.
- **`pnpm run lint:md`**: Lints all Markdown files.
- **`pnpm run lint:fix`**: Fixes linting issues in JavaScript/TypeScript files.
- **`pnpm run format`**: Formats all files using Prettier.

### Pre-commit Checks

The repository uses **husky** to run several checks before a commit is
created:

- `pnpm format` – formats the entire codebase using Prettier.
- `pnpm lint` – lints all JavaScript/TypeScript files.
- `pnpm lint:md` – lints Markdown files.
- `pnpm lint-staged` – applies fixes to staged files.

## **1. Zielsetzung und Use Cases**

- **Für Entwickler**:  
  Codeverlauf verstehen, Refactorings nachvollziehen,  
  eigene Beiträge analysieren.

- **Für Teams**:  
  Projektentwicklung visualisieren,  
  Contributions bewerten.

- **Für Bewerbungen**:  
  Visualisierte Projekte als Portfolio‑Highlight.

- **Für Forschung/Lehre**:  
  Git‑Prozesse oder Open‑Source‑Projektverläufe analysieren.

---

## **2. Kernfeatures**

### **A. Visualisierung**

- **Timeline‑Grafik**:  
  Commits als Punkte, verbunden durch Linien, sortiert nach Datum.

- **Interaktive Commit‑Map**:  
  Jeder Commit als Knoten, Verzweigungen als Kanten →  
  Git‑Graph à la `git log --graph`.

- **File Change Tree**:  
  Zeigt, welche Dateien sich bei welchem Commit geändert haben.

- **Heatmaps**:  
  Aktivitätsverläufe über Zeit, z.B. Lines of Code oder Commits pro Woche.

- **Author Layer**:  
  Zeigt, welcher Entwickler wann und wo im Projekt aktiv war.

- **Branching‑Diagramm**:  
  Klare Darstellung von Merge‑/Feature‑Branches.

### **B. User Interaction**

- **Zoom & Pan**:  
  Für große Repos essenziell.

- **Hover‑Details**:  
  Zeigt Commit‑Message, Author, Diff‑Vorschau, etc.

- **Filter**:  
  Nach Datei, Autor, Zeitraum, Branch.

- **Playback‑Funktion**:  
  Zeitraffer der Projektentwicklung (wie ein Film).

- **Diff‑Viewer**:  
  Klick auf Commit zeigt Codeunterschiede.

---

## **3. Eingabe & Backend**

- **Input**:  
  Nur GitHub‑URL – z.B. `https://github.com/user/repo`.

- **Optional**:

  - Branch auswählen
  - Zeitraum festlegen

- **Backend‑Funktionalitäten**:

  - Clonen des Repos temporär  
    (per `git clone --depth=N`)

  - Analyse mit `git log`, `git diff`, `git blame` etc.

  - Code‑Pipeline zur Aufbereitung der Daten

  - Speicherung temporär oder dauerhaft  
    (User‑Account nötig?)

---

## **4. Erweiterte Features**

- **Contribution Ranking**:  
  Wer hat wie viel gemacht? LOC, Commits, Files touched.

- **Code Churn Analyse**:  
  Welche Dateien wurden oft geändert? (Bug‑Hotspots)

- **Refactoring‑Detection**:  
  Identifiziert große Codeänderungen ohne funktionale Änderung.

- **AI Summary**:  
  Lasse dir von einer AI pro Woche/Monat einen Text schreiben,  
  was sich getan hat.

- **Tag Clustering**:  
  Gruppiere Commits nach Issue Tags, Commit‑Messages  
  (z.B. Bugfix, Feature, Refactor).

- **Issue‑Overlay**:  
  Verknüpfe Commits mit GitHub Issues & Pull Requests.

---

## **5. Technische Architektur**

- **Frontend**:  
  React + D3.js / visx / Chart.js für Visualisierungen.

- **Backend**:  
  Node.js oder Python (FastAPI), evtl. Dockerisierung für  
  Git‑Analyse.

- **Datenhaltung**:  
  Redis für Cache, PostgreSQL oder MongoDB für persistente Userdaten.

- **Security**:  
  Sandbox‑Repo‑Cloning, API Rate Limits, Auth‑Token‑Handling  
  bei Private Repos.

---

## **6. UI/UX Ideen**

- **Dark/Light Mode**

- **"Story Mode"**:  
  Zeigt wie ein Comic/Storybook, wie das Projekt gewachsen ist.

- **"Insights"-Seite**:  
  AI‑generierte Zusammenfassungen der Projektentwicklung.

- **Responsive & Mobile‑Ready**

- **Export Feature**:  
  PNG, PDF, sogar MP4 vom Timelapse.

---

## **7. Potenziale für Monetarisierung / Community**

- **Freemium‑Modell**:  
  Basic Visualisierung kostenlos,  
  Advanced Features z.B. für Teams.

- **Open Source Variante**:  
  Basic Engine als OSS – Premium Features gehostet.

- **GitHub Action Integration**:  
  Als Badge im Repo anzeigen.

- **Nutzerprofile**:  
  Eigene Projekte darstellen, Leaderboards, etc.

---

## **8. Herausforderungen & Anforderungen**

- **Performance bei großen Repos**:  
  Asynchrone Verarbeitung, ggf. Queue‑System.

- **Private Repos?**:  
  OAuth‑Login mit GitHub, Token‑basiert.

- **Sicherheitsaspekte**:  
  Keine schädlichen Inhalte beim Cloning ausführen lassen.

- **Skalierung**:  
  Wenn viele Nutzer gleichzeitig einsteigen – Queue mit Feedback.
