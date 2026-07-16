# SkyCare

![SkyCare Banner](public/img/banner.png)

> A modern hospital management system with role-based access control, built with Node.js, Express, TiDB (MySQL protocol), Cloudinary, and vanilla JavaScript.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## Overview

SkyCare is a clean, browser-based hospital management system for handling patients, doctors, admissions, billing, staff duties, blood bank data, and audit trails. It includes secure authentication, role-based permissions, and a polished UI with light and dark themes.

- Live demo: https://skycare.onrender.com
- GitHub repository: https://github.com/golammonayem/SkyCare.git

## Key Features

- Dashboard with live hospital stats and summaries
- Department, doctor, patient, room, and admission management
- Medical records, appointments, billing, staff duties, and blood bank modules
- 5-role access control: Admin, Senior Doctor, Junior Doctor, Nurse, Staff
- Session-based auth with bcrypt password hashing
- Admin-only user management and audit logging
- Profile picture upload through Cloudinary
- Responsive UI with SVG icons and Plus Jakarta Sans typography

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | TiDB Serverless via MySQL protocol |
| Auth | bcryptjs + token sessions |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Media | Cloudinary + Multer |
| UI | SVG icons, responsive layout, light/dark mode |

## Local Setup

### Requirements

- Node.js 16+
- npm 7+
- TiDB database or compatible MySQL database
- Cloudinary account for avatar uploads

### Install and Run

```bash
git clone https://github.com/golammonayem/SkyCare.git
cd SkyCare
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Demo Accounts

| Username | Password | Role |
|---|---|---|
| admin | SkyAdmin#2026 | Admin |
| dr.ayesha | DrAyesha#2026 | Senior Doctor |
| dr.rafi | DrRafi#2026 | Junior Doctor |
| nurse.anwar | NurseAnwar#2026 | Nurse |
| staff.belal | StaffBelal#2026 | Staff |

You can override the default bootstrap passwords with these environment variables:

- `SKYCARE_ADMIN_PASSWORD`
- `SKYCARE_DR_AYESHA_PASSWORD`
- `SKYCARE_DR_RAFI_PASSWORD`
- `SKYCARE_NURSE_ANWAR_PASSWORD`
- `SKYCARE_STAFF_BELAL_PASSWORD`

## Environment Variables

### Required Database Settings

- `TIDB_HOST`
- `TIDB_PORT`
- `TIDB_USER`
- `TIDB_PASSWORD`
- `TIDB_DATABASE`

### Optional Settings

- `NODE_ENV` — defaults to `production` on Render
- `SELF_PING_ENABLED` — enables server-side health ping loop
- `APP_URL` — overrides the keepalive base URL
- `RENDER_EXTERNAL_URL` — automatically used on Render
- `TIDB_SSL_CA` — custom CA certificate for TiDB TLS
- `TIDB_DISABLE_TLS` — set to `true` only if your database requires no TLS
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER` — defaults to `skycare/avatars`

## Deployment on Render

1. Push the project to GitHub
2. Connect the repository to Render
3. Let Render load `render.yaml`
4. Add the TiDB and Cloudinary environment variables
5. Deploy the service

The app exposes a health endpoint at `/healthz`. It also includes a small client-side keepalive script that pings the health endpoint while a browser tab is open. That helps reduce sleep time for active users, but it does not replace a true uptime monitor.

For more reliable always-on behavior on a free Render service, use an external monitor such as UptimeRobot to ping `https://YOUR_RENDER_URL/healthz` every 14 minutes.

## Project Structure

```text
SkyCare/
├── server.js
├── package.json
├── render.yaml
├── database/
│   ├── schema.sql
│   └── init.js
├── public/
│   ├── index.html
│   ├── login.html
│   ├── css/
│   ├── js/
│   ├── img/
│   └── uploads/
└── .gitignore
```

## Manual Run

```bash
npm install
NODE_ENV=production node server.js
```

The app listens on the `PORT` environment variable, or `3000` locally.

## License

MIT License. Free to use for academic and personal projects.

## Credits

Built as a DBMS lab course project.

Design inspired by modern medical SaaS interfaces.
