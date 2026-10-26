# 🚗 ParkPulse 2.0 — Smart Campus Parking Management System

[![PWA Ready](https://img.shields.io/badge/PWA-Installable-10B981?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B%20Ready-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

> **ParkPulse 2.0** is an installable, mobile-first Progressive Web App (PWA) with persistent cloud storage, separate student and staff parking enforcement, real-time First-Come-First-Allocated (FCFA) slots, dual-ring GPS geofencing, and Google Maps-inspired in-lot navigation.

Tagline: **Park Smarter. Save Time. Move Better.**

---

## 📑 Table of Contents

- [What's New in ParkPulse 2.0](#-whats-new-in-parkpulse-20)
- [System Architecture](#-system-architecture)
- [Student vs. Staff Parking Separation](#-student-vs-staff-parking-separation)
- [Mobile-First PWA & Installation](#-mobile-first-pwa--installation)
- [Core Engines](#-core-engines)
  - [1. FCFA Allocation & Concurrency Engine](#1-fcfa-allocation--concurrency-engine)
  - [2. Dual-Ring GPS Geofencing](#2-dual-ring-gps-geofencing)
  - [3. Dijkstra In-Lot Navigation & Digital Twin](#3-dijkstra-in-lot-navigation--digital-twin)
  - [4. Dynamic 3-Minute Hold & Queue Dispatcher](#4-dynamic-3-minute-hold--queue-dispatcher)
- [Cloud Database & PostgreSQL Migration](#-cloud-database--postgresql-migration)
- [Directory Structure](#-directory-structure)
- [Quick Start Guide](#-quick-start-guide)
  - [Prerequisites](#prerequisites)
  - [Installation & Local Run](#installation--local-run)
  - [Running Automated Tests](#running-automated-tests)
- [Demo Credentials](#-demo-credentials)
- [Cloud Deployment (Render + Vercel)](#-cloud-deployment-render--vercel)
- [License](#-license)

---

## 🚀 What's New in ParkPulse 2.0

1. **Installable Mobile PWA (`vite-plugin-pwa`):** Standalone app mode, emerald green branding (`#10B981`), home screen installation banners for Android and iOS Safari, and offline app shell caching.
2. **5-Tab Mobile Navigation:** Tailored for 320px–390px+ smartphones with native bottom navigation:
   - 🏠 **Home:** Location check, vehicle class selector, category vacancy rates, instant booking.
   - 🗺️ **Parking Map:** Google Maps-style interactive campus parking lot with pan/zoom and live route highlighting.
   - 🅿️ **My Slot:** Active reservation hold timer, turn-by-turn guidance, parking check-in and release.
   - 📜 **History:** Comprehensive past parking sessions and duration logs.
   - 👤 **Profile:** Authoritative user category badge (`Student` vs `Staff`), vehicle preference, and sign out.
3. **Strict Student & Staff Segregation:** Dedicated student areas (Zone A & B) and staff areas (Zone C & D) enforced authoritatively on the backend.
4. **Cloud Database Architecture:** Dual PostgreSQL and SQLite engine with automated migrations and one-command SQLite-to-PostgreSQL data sync (`npm run migrate:pg`).
5. **Offline Safety:** Network detection halts live reservation requests during disconnections while maintaining cached map visibility.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph MobilePWA ["Mobile PWA (React 18 + Vite)"]
        SW[Service Worker & Offline Cache]
        UI[5-Tab Mobile Shell]
        NavMap[Interactive Dijkstra Parking Map]
        SocketClient[Socket.IO Client]
    end

    subgraph BackendService ["Backend Cloud Service (Node.js & Express)"]
        Router[REST API Routes]
        AuthGuard[JWT Cookie Auth & Category Guards]
        SocketGateway[Socket.IO Gateway]

        subgraph CoreEngines ["Core Allocation Engines"]
            FCFA[FCFA Slot Allocation]
            Segregation[Student / Staff Area Segregator]
            Geo[Dual-Ring Haversine Geofence]
            Dijkstra[Graph Shortest-Path Engine]
            HoldCron[Background Expiry Sweeper (5s)]
        end
    end

    subgraph PersistenceLayer ["Persistence Layer"]
        PG[(PostgreSQL 14+ / SQLite)]
        Nodes[(Map Nodes & Edges Table)]
    end

    UI --> Router
    NavMap --> Dijkstra
    Router --> AuthGuard --> CoreEngines
    CoreEngines --> PG
    Dijkstra --> Nodes
    HoldCron -->|Reclaim Expired| PG
    PG --> SocketGateway
    SocketGateway <==>|Real-Time State Sync| SocketClient
```

---

## 🔒 Student vs. Staff Parking Separation

To eliminate parking competition between faculty and students, ParkPulse 2.0 strictly partitions the lot into distinct access-controlled zones:

| Zone Code | Zone Name | Vehicle Type | Access Policy | Total Capacity | Allowed Accounts |
|---|---|---|---|---|---|
| **Zone A** | Student Bike Parking | 🏍️ Bike | `student_only` | 16 Bays (A1–A16) | Student Accounts Only |
| **Zone B** | Student Car Parking | 🚗 Car | `student_only` | 12 Bays (B1–B12) | Student Accounts Only |
| **Zone C** | Staff Car Parking | 🚗 Car | `staff_only` | 8 Bays (C1–C8) | Staff Accounts Only |
| **Zone D** | Staff Bike Parking | 🏍️ Bike | `staff_only` | 8 Bays (D1–D8) | Staff Accounts Only |

> **Backend Enforcement:** The FCFA allocation engine validates `user_category` directly from the database record during every slot request. Students can never be assigned staff slots, and staff never consume student capacity.

---

## 📱 Mobile-First PWA & Installation

ParkPulse 2.0 is built to run as a native-feeling mobile app without App Store friction.

### Installing on Android (Chrome / Edge / Brave):
1. Navigate to the deployed URL.
2. Tap the floating **Install ParkPulse** action banner at the bottom, or select **Install App** from the browser menu.
3. The app will launch in full standalone mode with a dedicated home screen icon.

### Installing on iPhone (iOS Safari):
1. Open the URL in Safari.
2. Tap the **Share** button in the Safari toolbar.
3. Scroll down and select **Add to Home Screen**.
4. Tap **Add** in the top right.

---

## ⚡ Core Engines

### 1. FCFA Allocation & Concurrency Engine
- Assigns vacant slots using First-Come-First-Allocated ordering.
- Implements atomic transactions (`BEGIN IMMEDIATE` in SQLite, row-level locking in PostgreSQL) to eliminate race conditions and double-booking during arrival spikes.

### 2. Dual-Ring GPS Geofencing
- **Ring 1: Campus Boundary (500m radius):** Verifies the driver is on university grounds.
- **Ring 2: Parking Entrance Gate (150m radius):** Prevents remote slot squatting; requests are unlocked only near the gate.
- **GPS Accuracy Verification:** Discards inaccurate GPS signals (> 50m drift).

### 3. Dijkstra In-Lot Navigation & Digital Twin
- Models parking lanes, gates, and bays as a weighted graph stored in database tables `map_nodes` and `map_edges`.
- Computes turn-by-turn routes with lane guidance (e.g. *"Enter via Main Gate -> Boulevard South -> Turn Left into Student Zone A -> Bay A4"*).
- Bi-directional Socket.IO updates keep all connected clients synchronized with zero latency.

### 4. Dynamic 3-Minute Hold & Queue Dispatcher
- Drivers receive a **3-minute hold timer** to park and check in.
- A background worker running every 5 seconds sweeps expired reservations and automatically offers vacant spots to drivers in the **waiting queue** (with a 60-second claim window).

---

## 🗄️ Cloud Database & PostgreSQL Migration

ParkPulse 2.0 supports zero-config SQLite for local offline development and managed PostgreSQL for cloud production.

### Migrating from SQLite to PostgreSQL
1. Provide your PostgreSQL connection URL in `server/.env`:
   ```env
   DATABASE_URL="postgresql://user:password@host:5432/parkpulse"
   ```
2. Run the automated migration script:
   ```bash
   npm --prefix server run migrate:pg
   ```
   *This automatically executes `001_postgres_schema.sql`, migrates records in foreign-key dependency order, and outputs a verification summary verifying row-count parity.*

---

## 📁 Directory Structure

```text
PARKING/
├── render.yaml               # Render Infrastructure blueprint (PostgreSQL + Node + Web)
├── package.json              # Monorepo root scripts (dev, setup, seed)
├── client/                   # Mobile-First React PWA
│   ├── public/               # PWA icons (192, 512, maskable, apple-touch)
│   ├── src/
│   │   ├── components/       # ParkingMap, PWAInstallBanner, OfflineNotice, DigitalTwin
│   │   ├── contexts/         # Auth, Socket.IO, Toast notifications
│   │   ├── pages/
│   │   │   ├── student/      # StudentDashboard (5 bottom tabs: Home, Map, Slot, History, Profile)
│   │   │   └── admin/        # Admin command center (Slots, Zones, Geofence, Analytics)
│   │   └── lib/              # Axios API client with VITE_API_URL support
│   ├── vercel.json           # Vercel SPA routing and PWA caching headers
│   └── vite.config.js        # VitePWA configuration and build setup
└── server/                   # Express + Socket.IO Backend
    ├── db/
    │   ├── migrations/       # 001_postgres_schema.sql (PostgreSQL production DDL)
    │   ├── migrate-to-pg.js  # SQLite to PostgreSQL migration runner
    │   ├── database.js       # SQLite & PostgreSQL database adapter
    │   └── seed.js           # Seeds separate student/staff zones and graph nodes
    ├── lib/
    │   ├── dijkstra.js       # Shortest-path routing over parking lanes
    │   └── geofence.js       # Haversine distance calculations
    ├── services/
    │   └── allocationEngine.js # FCFA engine with strict student/staff segregation
    ├── tests/
    │   └── parkpulse.test.js # Automated unit & integration test suite
    └── index.js              # Server entry point with multi-origin CORS & trust proxy
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** (v22.0.0 or higher recommended).
- **npm** (v10+).

### Installation & Local Run

1. **Install dependencies and seed the database:**
   ```bash
   npm run setup
   ```

2. **Start frontend and backend concurrently:**
   ```bash
   npm run dev
   ```
   - **Frontend Client:** [http://localhost:5173](http://localhost:5173)
   - **Backend API:** [http://localhost:5000](http://localhost:5000)

### Running Automated Tests

Run the built-in test suite verifying FCFA allocation, geofencing, student/staff segregation, and Dijkstra routing:

```bash
npm --prefix server test
```

---

## 🔑 Demo Credentials

Pre-seeded accounts for testing all parking roles and areas:

| Account Role | Email | Password | Allowed Parking Area |
|---|---|---|---|
| **System Admin** | `admin@parkpulse.edu` | `Admin@123` | Full Admin Command Center |
| **Student (Bike)** | `arun@student.psg.edu` | `Student@123` | 🏍️ Zone A — Student Bikes (A1–A16) |
| **Student (Car)** | `bala@student.psg.edu` | `Student@123` | 🚗 Zone B — Student Cars (B1–B12) |
| **Staff (Car)** | `suresh@staff.psg.edu` | `Staff@123` | 🚗 Zone C — Staff Cars (C1–C8) |
| **Staff (Bike)** | `kavitha@staff.psg.edu` | `Staff@123` | 🏍️ Zone D — Staff Bikes (D1–D8) |

---

## ☁️ Cloud Deployment (Render + Vercel)

### Option 1: Full-Stack on Render (Blueprint)
1. Push your repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com), click **New + ➔ Blueprint**.
3. Select your repository. Render reads `render.yaml` and provisions:
   - Managed PostgreSQL database
   - Node.js backend web service
   - Static frontend client
4. Deploy with 1 click.

### Option 2: Frontend on Vercel + Backend on Render
- **Backend (Render):**
  - Create a Node Web Service pointing to `server/`.
  - Set `DATABASE_URL` and `CLIENT_ORIGIN=https://your-app.vercel.app`.
- **Frontend (Vercel):**
  - Import `client/` into Vercel.
  - Set `VITE_API_URL=https://your-backend.onrender.com`.
  - Vercel automatically applies `vercel.json` for SPA routing and PWA support.

---

## 📄 License

Open-source and licensed under the [MIT License](LICENSE).
