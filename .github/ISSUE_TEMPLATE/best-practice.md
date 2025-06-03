<!-- markdownlint-disable MD025 -->
<!-- markdownlint-disable MD032 -->
<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD022 -->
<!-- markdownlint-disable MD003 -->
<!-- markdownlint-disable MD013 -->
---
name: Best Practice Issue Template
about: Optimiertes Template für Features, Bugs, Enhancements und Tasks
title: 'type(scope): brief description'
labels: 'needs-triage'
assignees: ''
---

## 🎯 Issue Type

<!-- Wähle den Typ aus und lösche die anderen -->
- [ ] 🐛 **Bug** - Etwas funktioniert nicht wie erwartet
- [ ] ✨ **Feature** - Neue Funktionalität
- [ ] 🔧 **Enhancement** - Verbesserung bestehender Funktionalität
- [ ] 📚 **Documentation** - Dokumentation fehlt oder ist unvollständig
- [ ] 🧹 **Chore** - Wartung, Refactoring, Tooling
- [ ] ❓ **Question** - Frage zur Implementierung oder Nutzung

## 📋 Beschreibung

### Problem/Bedarf
<!-- Beschreibe klar und präzise das Problem oder den Bedarf -->

### Erwartetes Verhalten
<!-- Was soll passieren? Wie sollte es funktionieren? -->

### Aktuelles Verhalten
<!-- Was passiert momentan? (nur bei Bugs/Enhancements) -->

## 🔄 Schritte zur Reproduktion

<!-- Detaillierte Schritte, um das Problem nachzuvollziehen (bei Bugs) oder um das Feature zu testen -->

1. Gehe zu...
2. Klicke auf...
3. Führe aus...
4. Beobachte...

## 🎨 Mockups/Screenshots

<!-- Falls vorhanden, füge Bilder, Mockups oder Code-Beispiele hinzu -->

```plain
Code-Beispiel oder Screenshot hier
```

## 🧪 Akzeptanzkriterien

<!-- Definition of Done - Was muss erfüllt sein, damit das Issue als erledigt gilt? -->

- [ ] Funktionalität implementiert und getestet
- [ ] Code reviewed
- [ ] Dokumentation aktualisiert (falls notwendig)
- [ ] Tests hinzugefügt/angepasst
- [ ] Manuell getestet in relevanten Browsern/Umgebungen
- [ ] In dev-Branch gemerged

## 🛠 Technische Details

### Betroffene Dateien/Komponenten
<!-- Wo im Code ist die Änderung notwendig? -->

### Abhängigkeiten
<!-- Gibt es andere Issues oder PRs, die zuerst abgeschlossen werden müssen? -->

### Breaking Changes
- [ ] Ja, diese Änderung könnte bestehende Funktionalität beeinträchtigen
- [ ] Nein, rückwärtskompatible Änderung

## 🏷 Kategorisierung

### Scope
- [ ] `scope:frontend` - Frontend/UI Änderungen
- [ ] `scope:backend` - Backend/API Änderungen  
- [ ] `scope:shared` - Geteilte Typen/Utils
- [ ] `scope:devops` - CI/CD, Deployment, Tools
- [ ] `scope:docs` - Dokumentation

### Priority  
- [ ] `prio:critical` - Produktions-kritischer Bug
- [ ] `prio:high` - Wichtiges Feature/Bug
- [ ] `prio:medium` - Normale Priorität
- [ ] `prio:low` - Nice-to-have

### Effort
- [ ] `effort:small` - < 2 Stunden
- [ ] `effort:medium` - 2-8 Stunden  
- [ ] `effort:large` - 1-3 Tage
- [ ] `effort:xl` - > 3 Tage

## 🌍 Umgebung

<!-- Falls relevant für Bugs -->

- **OS**: [z.B. Windows 11, macOS 14, Ubuntu 22.04]
- **Browser**: [z.B. Chrome 120, Firefox 121, Safari 17]
- **Node Version**: [z.B. 20.10.0]
- **Repo Branch**: [z.B. main, dev, feature/xyz]

## 🔗 Verwandte Issues/PRs

<!-- Links zu anderen Issues oder Pull Requests -->

- Relates to #
- Blocks #  
- Blocked by #

## 📝 Zusätzliche Notizen

<!-- Weitere Informationen, Überlegungen, alternative Ansätze -->

## ✅ Checklist für Reviewer

- [ ] Issue ist klar und verständlich formuliert
- [ ] Akzeptanzkriterien sind messbar
- [ ] Labels und Priority sind gesetzt
- [ ] Technische Machbarkeit ist gegeben
