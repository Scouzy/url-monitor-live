# URL Monitor Live

Application de surveillance d'URLs en temps réel avec gestion des serveurs, capacity planning et journal des alertes.

## 🚀 Fonctionnalités

- **Surveillance URLs** — vérification automatique configurable (10s à 5min), pause individuelle, notifications navigateur
- **Métriques** — uptime 24h/7j/30j, P50/P95/P99, MTTR, timeline incidents
- **Journal des alertes** — pannes, rétablissements, SSL, alertes serveurs, alertes capacité
- **Inventaire Serveurs** — import Excel / API ITcare, jauges CPU/RAM/Disque, tendances 12 mois
- **Capacity Planning** — projections 6 mois, seuil critique 90%, recommandations automatiques
- **TodoList** — vues Kanban/Liste/Grille/Historique, tâches auto-générées (SSL + capacity), export Excel
- **Paramètres** — intervalles, notifications, seuils d'alertes serveurs, gestion des données

## 🛠 Stack technique

- **React 18** + Vite
- **Recharts** — graphiques et tendances
- **SheetJS (xlsx)** — import/export Excel
- **Lucide React** — icônes
- **localStorage** — persistance des données

## 📦 Installation

```bash
npm install
npm run dev
```

## 🔧 Configuration

Les paramètres sont accessibles depuis l'onglet **Paramètres** dans la sidebar :
- Intervalle de vérification
- Seuils CPU/RAM/Disque pour les alertes
- Gestion des notifications navigateur

## 📁 Structure

```
src/
├── components/
│   ├── UrlCard.jsx         # Carte URL (grille/liste) + pause individuelle
│   ├── ServersView.jsx     # Inventaire serveurs + panneau détail
│   ├── CapacityPlanning.jsx # Capacity planning + projections
│   ├── TodoList.jsx        # Gestionnaire de tâches (Kanban/Liste/Grille)
│   ├── IncidentLog.jsx     # Journal des alertes
│   ├── Sidebar.jsx         # Navigation latérale
│   └── ServerImport.jsx    # Import Excel + API ITcare
├── utils/
│   ├── servers.js          # Store serveurs + recommendations
│   ├── snapshots.js        # Snapshots historiques + projections
│   ├── capacitySettings.js # Paramètres seuils capacity
│   └── todoStorage.js      # Persistance des tâches
└── App.jsx                 # Composant racine
```

## 📄 Licence

MIT
