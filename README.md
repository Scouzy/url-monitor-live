# G1Oeil — Supervision & Capacity Planning

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

Application de supervision d'URLs en temps réel avec gestion des serveurs, capacity planning, journal des alertes, backend d'administration et comparaison d'images de référence.

## 🚀 Fonctionnalités

### Frontend (port 5173)
- **Surveillance URLs** — vérification automatique configurable (10s à 5min), pause individuelle, notifications navigateur
- **Multi-étapes** — mode simple (HEAD) ou authentifiée (Playwright : accès → auth → accueil → onglet)
- **Code 622 (CHANGED)** — détection de changements visuels par comparaison pixel-by-pixel
- **Métriques** — uptime 24h/7j/30j, P50/P95/P99, MTTR, timeline incidents
- **Journal des alertes** — pannes, rétablissements, SSL, alertes serveurs, alertes capacité
- **Inventaire Serveurs** — import Excel / API ITCare, jauges CPU/RAM/Disque, tendances 12 mois
- **Capacity Planning** — projections 6 mois, seuil critique 90%, recommandations automatiques
- **TodoList** — vues Kanban/Liste/Grille/Historique, tâches auto-générées (SSL + capacity), export Excel
- **Connexion backend** — login/logout JWT, synchronisation automatique des URLs vers le backend
- **Paramètres** — intervalles, notifications, seuils d'alertes serveurs, gestion des données

### Backend (port 3210)
- **Authentification JWT** — comptes admin/superadmin, rôles, middleware
- **Gestion des URLs** — CRUD complet, étapes par URL, upload d'images de référence
- **Comparaison d'images** — Playwright (headless) + pixelmatch, code 622 si changement visuel
- **Gestion des APIs** — CRUD complet (bearer, oauth2, api_key, none), test de connexion
- **Audit logs** — connexions/déconnexions, modifications, indisponibilités, déconnexions ITCare, perte de synchro
- **UI Admin** — SPA vanilla JS avec sidebar, gestion URLs/images/APIs/utilisateurs/logs

## 🛠 Stack technique

| Couche | Technologies |
|--------|-------------|
| Frontend | React 18, Vite, Recharts, SheetJS (xlsx), Lucide React |
| Backend | Express 4, SQLite (better-sqlite3), JWT, Multer |
| Tests visuels | Playwright (headless), Pixelmatch, PNGJS |
| Persistance | localStorage (frontend), SQLite (backend) |

## 📦 Installation

### Frontend
```bash
npm install
npm run dev
```
→ `http://localhost:5173`

### Backend
```bash
cd backend
npm install
npm start
```
→ `http://localhost:3210` — Admin UI

**Compte par défaut** : `admin` / `admin123` (rôle superadmin)

> ⚠️ Changez le mot de passe après la première connexion.

## 🔧 Configuration

### Frontend
Les paramètres sont accessibles depuis l'onglet **Paramètres** dans la sidebar :
- Intervalle de vérification
- Seuils CPU/RAM/Disque pour les alertes
- Gestion des notifications navigateur

### Backend
- Connexion depuis le frontend via le bouton **Connexion** dans le header
- Synchronisation automatique des URLs au login
- Heartbeat toutes les 30s pour tracer la synchro frontend ↔ backend

## � Audit & Logs

L'onglet **Logs supervision** du backend trace :

| Catégorie | Événements |
|-----------|-----------|
| **Auth** | login, login_failed, logout |
| **User** | create, update, delete |
| **URL** | create, update, delete, step_create, image_upload |
| **API** | create, update, delete |
| **Sync** | heartbeat, lost (perte synchro), restored, url_import |
| **System** | startup, incident (URL down), logs_cleared |
| **ITCare** | api_error, api_disconnect, disconnect |

## �📁 Structure

```
url-monitor-live/
├── src/                        # Frontend React
│   ├── components/
│   │   ├── UrlCard.jsx         # Carte URL (grille/liste) + pause
│   │   ├── LoginPanel.jsx      # Login/logout backend + sync URLs
│   │   ├── ServersView.jsx     # Inventaire serveurs + détail
│   │   ├── CapacityPlanning.jsx # Capacity planning + projections
│   │   ├── TodoList.jsx        # Tâches (Kanban/Liste/Grille)
│   │   ├── IncidentLog.jsx     # Journal des alertes
│   │   ├── ServerImport.jsx    # Import Excel + API ITCare
│   │   └── Sidebar.jsx         # Navigation latérale
│   ├── utils/
│   │   ├── backendAuth.js      # Auth backend + heartbeat + audit logs
│   │   ├── checkUrl.js         # Vérification URL + multi-étapes
│   │   ├── servers.js          # Store serveurs + recommendations
│   │   ├── snapshots.js        # Snapshots historiques + projections
│   │   └── storage.js          # Persistance localStorage
│   ├── constants.js            # Statuts + code 622 (CHANGED)
│   └── App.jsx                 # Composant racine
├── backend/                    # Backend Express + SQLite
│   ├── server.js               # Point d'entrée
│   ├── db.js                   # SQLite setup + migrations
│   ├── auth.js                 # JWT middleware
│   ├── auditLog.js             # Helper audit logging
│   ├── seed.js                 # Seed APIs + import URLs
│   ├── routes/
│   │   ├── auth.js             # Auth + users + heartbeat
│   │   ├── urls.js             # URLs + steps + images + import
│   │   ├── apis.js             # APIs CRUD + test
│   │   ├── compare.js          # Comparaison Playwright + pixelmatch
│   │   └── audit.js            # Logs d'audit (GET/POST/DELETE)
│   ├── data/
│   │   ├── g1oeil.db           # Base SQLite
│   │   ├── images/             # Images de référence
│   │   └── screenshots/        # Screenshots live + diffs
│   ├── public/                 # UI admin (vanilla JS SPA)
│   │   ├── index.html
│   │   ├── css/admin.css
│   │   └── js/admin.js
│   └── package.json
└── package.json
```

## 🔌 API Endpoints (Backend)

### Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/logout` | Déconnexion |
| POST | `/api/auth/register` | Créer un compte (superadmin) |
| GET | `/api/auth/me` | Profil courant |
| POST | `/api/auth/heartbeat` | Ping frontend (synchro) |
| GET/PUT/DELETE | `/api/auth/users/:id` | Gestion utilisateurs |

### URLs
| Méthode | Route | Description |
|---------|-------|-------------|
| GET/POST | `/api/urls` | Liste / création |
| PUT/DELETE | `/api/urls/:id` | Modification / suppression |
| POST | `/api/urls/import` | Import depuis le frontend |
| POST | `/api/urls/:id/steps` | Ajouter une étape |
| POST | `/api/urls/:id/steps/:stepId/image` | Upload image de référence |

### Compare
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/compare/:urlConfigId` | Test + comparaison d'images |
| GET | `/api/compare/logs/:urlConfigId` | Historique des checks |

### APIs
| Méthode | Route | Description |
|---------|-------|-------------|
| GET/POST | `/api/apis` | Liste / création |
| PUT/DELETE | `/api/apis/:id` | Modification / suppression |
| POST | `/api/apis/:id/test` | Tester la connexion |

### Audit
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/audit?category=&limit=` | Liste des logs |
| POST | `/api/audit` | Log depuis le frontend |
| DELETE | `/api/audit` | Vider les logs (superadmin) |

## 📄 Licence

MIT
