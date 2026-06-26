# Equora

A premium personal expense and income tracker for salaried individuals, professionals, students, and freelancers — built with React, Vite, and Firebase.

Equora's visual signature is **the balance beam**: a tipping fulcrum that visually weighs income against expense, echoed in the logo, the dashboard, and every progress bar in the app. The idea is in the name — *equilibrium* between what comes in and what goes out.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite |
| Routing | React Router v6 |
| Backend | Firebase (Authentication + Firestore) |
| Charts | Recharts |
| Icons | lucide-react |
| Exports | jsPDF + jspdf-autotable (PDF), PapaParse (CSV), SheetJS/xlsx (Excel) |
| Dates | date-fns |
| Styling | Plain CSS with a CSS-variable design token system (no framework lock-in) |

No backend server is required beyond Firebase — Equora talks to Firebase Authentication and Firestore directly from the browser, secured by Firestore Security Rules.

---

## 2. File structure

```
equora/
├── public/
│   └── equora-mark.svg              # App icon / favicon (the balance-beam logo)
├── src/
│   ├── main.jsx                     # Vite entry point
│   ├── App.jsx                      # Top-level providers (Theme, Toast, Router, Auth)
│   ├── routes/
│   │   ├── AppRouter.jsx            # All route definitions
│   │   └── ProtectedRoute.jsx       # Auth guards (ProtectedRoute / PublicOnlyRoute)
│   ├── context/
│   │   ├── AuthContext.jsx          # Firebase auth state + user profile
│   │   ├── ThemeContext.jsx         # Light/dark mode, persisted to localStorage
│   │   └── DataContext.jsx          # Subscribes to Firestore, derives all metrics
│   ├── hooks/
│   │   └── useFinancialAutomation.js # Recurring bills, budget/goal/bill notifications
│   ├── firebase/
│   │   ├── config.js                # Firebase init — ADD YOUR KEYS HERE
│   │   ├── auth.js                  # Sign up / in / out, password reset, etc.
│   │   └── firestore.js             # CRUD + realtime subscriptions per collection
│   ├── lib/
│   │   ├── constants.js             # Categories, account types, currencies, etc.
│   │   ├── format.js                # Money/percent formatting helpers
│   │   ├── validation.js            # Form validation helpers
│   │   └── exporters.js             # CSV / Excel / PDF export + report builders
│   ├── styles/
│   │   ├── tokens.css               # Design tokens (colors, spacing, radii) — light & dark
│   │   ├── global.css               # Reset, base styles, accessibility helpers
│   │   └── grid.css                 # Shared responsive grid layouts
│   └── components/
│       ├── ui/                      # Button, Card, Modal, FormControls, Toast, BalanceBeam…
│       ├── layout/                  # Sidebar, TopBar, AppLayout, PageShell
│       ├── auth/                    # AuthPage, ForgotPasswordModal, VerificationBanner
│       ├── dashboard/                # DashboardPage + all dashboard widgets
│       ├── transactions/            # TransactionsPage, forms, toolbar, bulk actions
│       ├── charts/                  # Recharts wrappers (trend, breakdown, cash flow…)
│       ├── budgets/                 # BudgetsPage + BudgetFormModal
│       ├── goals/                   # GoalsPage + GoalFormModal
│       ├── analytics/               # AnalyticsPage
│       ├── reports/                 # ReportsPage + ReportCard
│       └── settings/                # SettingsPage, AccountFormModal, SettingsSection
├── firestore.rules                  # Security rules — user data isolation
├── firestore.indexes.json           # Composite indexes for efficient queries
├── firebase.json                    # Hosting + Firestore deploy config
├── .firebaserc                      # Firebase project alias — ADD YOUR PROJECT ID
├── .env.example                     # Template for Firebase env vars
└── package.json
```

---

## 3. Setup instructions

### 3.1 Install dependencies

```bash
cd equora
npm install
```

### 3.2 Create your Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com) and create a new project (e.g. "Equora").
2. In **Project Settings → General → Your apps**, add a **Web app**. Copy the config object Firebase shows you.
3. In **Build → Authentication → Sign-in method**, enable:
   - **Email/Password**
   - **Google**
4. In **Build → Firestore Database**, click **Create database** and start in **production mode**.

### 3.3 Add your Firebase credentials

Equora reads Firebase config from environment variables, with safe placeholders as a fallback so the app doesn't crash if you forget a step.

Copy the example env file:

```bash
cp .env.example .env.local
```

Open `.env.local` and paste in the values from your Firebase web app config:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
```

`.env.local` is already in `.gitignore`, so your real keys are never committed.

> If you'd rather hardcode values for a quick local test, you can edit the placeholders directly in `src/firebase/config.js` — every line that needs a value is commented `REPLACE_WITH_...`.

### 3.4 Deploy Firestore security rules and indexes

This is **required** before sign-up will work, since the rules lock every collection to its owner.

```bash
npm install -g firebase-tools   # if you don't already have it
firebase login
firebase use --add              # select your project, alias it "default"
firebase deploy --only firestore:rules,firestore:indexes
```

Alternatively, paste the contents of `firestore.rules` into **Firestore → Rules** in the console directly.

### 3.5 Run the app locally

```bash
npm run dev
```

Visit `http://localhost:5173`. Sign up for an account — this automatically creates your `users/{uid}` profile document in Firestore with sensible defaults (USD currency, English, light theme).

---

## 4. Firebase integration guide

### 4.1 Authentication

`src/firebase/auth.js` wraps every auth operation:

- `signUpWithEmail` — creates the user, sets their display name, sends a verification email, and creates their Firestore profile document.
- `signInWithEmail` — supports a "Remember me" toggle, which switches between `browserLocalPersistence` (stays signed in) and `browserSessionPersistence` (signed out when the tab closes).
- `signInWithGoogle` — same persistence behavior, creates a profile document on first sign-in only.
- `resetPassword`, `resendVerificationEmail`, `changePassword`, `deleteAccountPermanently` cover the rest of the account lifecycle.
- `mapAuthError` converts Firebase error codes into friendly messages shown in toasts.

`AuthContext` listens to `onAuthStateChanged` and exposes `user`, `profile` (the live Firestore profile document), `isAuthenticated`, and `isVerified` to the whole app.

### 4.2 Firestore data model

All of a user's data lives under `users/{uid}`, so the security rules can isolate it with a single ownership check:

```
users/{uid}                       — profile + preferences (currency, theme, language…)
users/{uid}/accounts/{id}         — cash, bank, savings, wallet, credit card accounts
users/{uid}/transactions/{id}     — income & expense entries
users/{uid}/budgets/{id}          — monthly / category / savings budgets
users/{uid}/goals/{id}            — savings goals with target, progress, deadline
users/{uid}/notifications/{id}    — budget/bill/goal alerts generated client-side
```

`src/firebase/firestore.js` exposes a small, consistent CRUD surface per collection (`addTransaction`, `updateBudget`, `subscribeToGoals`, etc.) built on a couple of generic helpers (`addItem`, `updateItem`, `deleteItem`, `subscribeToCollection`) so every module follows the same pattern.

### 4.3 Real-time data flow

`DataContext` subscribes to all five collections via `onSnapshot` as soon as a user is signed in, and recomputes every derived metric (balances, monthly trends, budget usage, the financial health score, spending insights) in a single `useMemo`. Every page reads from this one context — there's no duplicate fetching.

### 4.4 Security rules

`firestore.rules` denies all access by default, then allows a user to read/write only documents nested under their own `users/{uid}` path. Re-deploy this file any time you change the data model.

### 4.5 Indexes

`firestore.indexes.json` defines composite indexes for queries the app might run if you extend it to filter server-side. As shipped, Equora filters by category, account, date range, and search **client-side** in React after subscribing to the full collection with `onSnapshot` — this keeps the UI fully real-time without juggling pagination cursors, and is appropriate for a personal app where one person's transaction history rarely exceeds a few thousand documents. If you expect a much larger dataset per user, the next step would be to move filtering into `where()` clauses in `src/firebase/firestore.js`, at which point the indexes already defined here will be the ones Firestore asks you to deploy.

---

## 5. Available scripts

```bash
npm run dev        # Start the Vite dev server
npm run build       # Production build to /dist
npm run preview     # Preview the production build locally
npm run lint         # Run ESLint
```

---

## 6. Deployment instructions

### Option A — Firebase Hosting (recommended, pairs naturally with Firestore)

```bash
npm run build
firebase deploy --only hosting
```

`firebase.json` is already configured to serve `/dist` with a single-page-app rewrite (so client-side routing works on refresh) and long-cache headers for static assets.

### Option B — Vercel / Netlify

1. Push this repository to GitHub.
2. Import it into Vercel or Netlify.
3. Build command: `npm run build`. Output directory: `dist`.
4. Add the six `VITE_FIREBASE_*` environment variables from `.env.example` in your hosting provider's dashboard (Project Settings → Environment Variables).
5. Because Firestore security rules — not your hosting provider — control data access, both options are equally secure.

### After every deploy

Re-run `firebase deploy --only firestore:rules,firestore:indexes` whenever you change `firestore.rules` or `firestore.indexes.json` — hosting deploys do **not** redeploy these automatically.

---

## 7. Design system notes

- All colors, spacing, radii, and typography live as CSS variables in `src/styles/tokens.css`, split into a light (`:root`) and dark (`[data-theme='dark']`) block. Toggling dark mode just sets `data-theme` on `<html>` — no component needs to know which theme is active.
- Money is always rendered in `IBM Plex Mono` via the `.mono-num` utility class, so amounts align like a real ledger.
- The `BalanceBeam` and `BeamProgress` components (`src/components/ui/BalanceBeam.jsx`) are the one signature visual element reused across the dashboard, budgets, and goals — everywhere progress or balance needs representing, it tips rather than just filling.

---

## 8. What to check before going to production

- [ ] Real Firebase credentials in `.env.local` (not committed)
- [ ] Firestore rules and indexes deployed
- [ ] Email/Password and Google sign-in enabled in the Firebase console
- [ ] A custom domain configured in Firebase Hosting (if used)
- [ ] Run `npm run build` once locally to confirm there are no build errors in your environment
- [ ] Test sign-up, sign-in, password reset, and account deletion end-to-end with a real Firebase project
