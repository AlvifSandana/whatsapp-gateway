# WhatsApp Gateway (MVP)

A robust, multi-tenant WhatsApp Gateway solution designed to manage multiple WhatsApp accounts, execute broadcast campaigns, handle auto-replies, and provide real-time connection status updates. Built with performance and scalability in mind using a modern TypeScript monorepo integration.

![Dashboard Preview](docs/assets/dashboard-preview.svg)

## 🚀 Features

- **Multi-Account Support**: Connect and manage multiple WhatsApp numbers simultaneously using MD (Multi-Device) support.
- **Real-Time Updates**: Server-Sent Events (SSE) for instant QR code streaming and connection status changes.
- **Campaign Management**: Create and schedule broadcast messages to targeted contact tags.
- **Auto-Reply Engine**: Configure keyword-based, regex, or containment rules for automated responses.
- **Contact Management**: Bulk import contacts via CSV and manage distinct contact lists per workspace.
- **Developer API**: RESTful API endpoints for programmatic control and integration.

## 🛠 Tech Stack

- **Monorepo**: [TurboRepo](https://turbo.build/)
- **Backend API**: [Hono](https://hono.dev/) (Node.js) - Lightweight, ultrafast web standard.
- **WhatsApp Runtime**: [Baileys](https://github.com/WhiskeySockets/Baileys) - Type-safe WhatsApp API library.
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Prisma ORM](https://www.prisma.io/).
- **Caching & PubSub**: [Redis](https://redis.io/) - For distributed locks and event messaging.
- **Dashboard**: [Astro](https://astro.build/) + [React](https://react.dev/) + [TailwindCSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/).

## 📂 Project Structure

```bash
.
├── apps
│   ├── api          # Hono REST API Service
│   ├── dashboard    # Astro Administration Dashboard
│   └── wa-runtime   # WhatsApp Connection Worker/Service
└── packages
    └── db           # Shared Prisma Client and Schema
```

## ⚡️ Getting Started

### Prerequisites

- **Node.js**: v18+
- **pnpm**: v9+
- **Docker**: For running PostgreSQL and Redis.

### 1. clone the repository

```bash
git clone https://github.com/AlvifSandana/whatsapp-gateway.git
cd whatsapp-gateway
```

### 2. Environment Setup

Create `.env` files for each service based on their requirements (or shared configuration).
*Ensure you have a `.env` in `packages/db` with `DATABASE_URL`.*

```bash
# Example for packages/db/.env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/whatsapp_gateway?schema=public"
```

### 3. Start Infrastructure

Use Docker Compose to spin up the database and Redis cache.

```bash
docker-compose up -d
```

### 4. Install Dependencies

```bash
pnpm install
```

### 5. Database Migration

Initialize the database schema.

```bash
pnpm db:push
```

### 6. Run Development Services

You can start all services simultaneously or individually.

```bash
# Start all apps (api, dashboard, wa-runtime)
pnpm dev

# OR start individually
pnpm --filter api dev
pnpm --filter dashboard dev
pnpm --filter wa-runtime dev
pnpm --filter worker dev
```

- **Dashboard**: http://localhost:4321
- **API**: http://localhost:3000

> If you run the standalone worker, set `EXPORT_WORKER_ENABLED=false` and
> `CONTACT_IMPORT_WORKER_ENABLED=false` in the API env to avoid duplicate jobs.

## 📖 API Documentation

The API endpoints are served at `http://localhost:3000/v1`.

- `GET /v1/wa-accounts` - List connected accounts.
- `GET /v1/events` - SSE Stream for real-time events.
- `POST /v1/contacts/import` - Upload CSV for contacts.
- `POST /v1/campaigns` - Create broadcast campaigns.

## ✅ Production Readiness

See `docs/production-checklist.md` and `docs/runbook-dlq.md`.

## 🔁 CI/CD

- CI workflow: `.github/workflows/ci.yml`
- Deploy workflow (manual): `.github/workflows/deploy.yml`
- Deploy script placeholder: `scripts/deploy.sh`

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any enhancements or bug fixes.

## 📄 License

This project is licensed under the MIT License.
