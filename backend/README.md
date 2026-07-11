# G1Oeil Backend

Backend d'administration pour G1Oeil — gestion des utilisateurs, configuration des URLs, comparaison d'images de référence, et gestion des APIs.

## Démarrage

```bash
cd backend
npm install
npm start
```

Le serveur démarre sur `http://localhost:3210`.

## Compte par défaut

- **Utilisateur**: `admin`
- **Mot de passe**: `admin123`
- **Rôle**: `superadmin`

⚠️ Changez le mot de passe après la première connexion.

## Fonctionnalités

### 1. Gestion des utilisateurs
- Création de comptes (superadmin uniquement)
- Rôles: `admin` et `superadmin`
- Modification du mot de passe et du rôle
- Suppression de comptes

### 2. Gestion des URLs & Images de référence
- CRUD complet des configurations d'URL
- Mode simple (HEAD) ou authentifiée (multi-étapes)
- Étapes configurables par URL (1=Accès, 2=Auth, 3=Accueil, 4=Onglet)
- Upload d'images de référence par étape
- Seuil de tolérance configurable par étape

### 3. Comparaison d'images (Code 622)
- Exécution des étapes avec Playwright (headless)
- Screenshot à chaque étape
- Comparaison pixel-by-pixel avec `pixelmatch`
- Code erreur **622** si changement visuel détecté
- Image diff générée pour visualiser les changements
- Historique des checks en base

### 4. Gestion des APIs
- CRUD complet des configurations d'API
- Types d'auth: `bearer`, `oauth2`, `api_key`, `none`
- Test de connexion intégré
- Headers personnalisables (JSON)

## API Endpoints

### Auth
- `POST /api/auth/login` — connexion
- `POST /api/auth/register` — créer un compte (superadmin)
- `GET /api/auth/me` — profil courant
- `GET /api/auth/users` — liste des utilisateurs (superadmin)
- `PUT /api/auth/users/:id` — modifier un utilisateur
- `DELETE /api/auth/users/:id` — supprimer un utilisateur

### URLs
- `GET /api/urls` — liste
- `POST /api/urls` — créer
- `PUT /api/urls/:id` — modifier
- `DELETE /api/urls/:id` — supprimer
- `POST /api/urls/:id/steps` — ajouter une étape
- `PUT /api/urls/:id/steps/:stepId` — modifier une étape
- `POST /api/urls/:id/steps/:stepId/image` — upload image de référence
- `DELETE /api/urls/:id/steps/:stepId/image` — supprimer image
- `GET /api/urls/images/:filename` — servir image de référence

### Compare
- `POST /api/compare/:urlConfigId` — exécuter test + comparaison
- `GET /api/compare/diff/:filename` — image diff
- `GET /api/compare/live/:filename` — screenshot live
- `GET /api/compare/logs/:urlConfigId` — historique des checks

### APIs
- `GET /api/apis` — liste
- `POST /api/apis` — créer
- `PUT /api/apis/:id` — modifier
- `DELETE /api/apis/:id` — supprimer
- `POST /api/apis/:id/test` — tester la connexion

## Structure

```
backend/
├── server.js          # Point d'entrée Express
├── db.js              # SQLite setup + migrations
├── auth.js            # JWT auth middleware
├── routes/
│   ├── auth.js        # Routes auth/users
│   ├── urls.js        # Routes URLs + steps + images
│   ├── apis.js        # Routes APIs + test
│   └── compare.js     # Routes comparaison d'images
├── data/
│   ├── g1oeil.db      # Base SQLite
│   ├── images/        # Images de référence
│   └── screenshots/   # Screenshots live + diffs
├── public/            # UI admin (vanilla JS SPA)
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js
└── package.json
```
