# QuizRoom

MVP web app for realtime quizzes with organizers, participants, rooms, scoring and leaderboard.

## Stack

- Frontend: React, Vite, React Router, Axios, Socket.IO Client
- Backend: Node.js, Express, Socket.IO, JWT, bcrypt, Multer
- Database: PostgreSQL, Prisma ORM
- Image storage: Supabase Storage
- Deployment target: Vercel, Render, Neon or Supabase

## Project structure

```text
client/   React app
server/   Express API, Socket.IO server, Prisma schema
docs/     notes for architecture and deployment
```

## Local setup

1. Install dependencies:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

2. Create local env files:

```bash
copy client\.env.example client\.env.local
copy server\.env.example server\.env.local
```

3. Put your PostgreSQL URL and Supabase Storage settings into `server/.env.local`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/quizroom?schema=public"
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SECRET_KEY="sb_secret_your_backend_key"
SUPABASE_STORAGE_BUCKET="quizroom-media"
```

4. Generate Prisma client and initialize the database:

```bash
npm run prisma:generate
npm run db:init --prefix server
```

If you use Supabase pooler and the universal init is slow, use the SQL editor in Supabase with
`server/prisma/init.sql`, or run the helper scripts that are already included in `server/prisma/`.

5. Optional demo data:

```bash
npm run seed --prefix server
```

Demo accounts:

```text
organizer@quizroom.local / password123
participant@quizroom.local / password123
```

6. Start development servers:

```bash
npm run dev
```

Frontend: http://localhost:5173

Backend: http://localhost:5000

Health check: http://localhost:5000/api/health

## Core flow

1. Organizer registers or signs in.
2. Organizer creates a quiz and questions.
3. Organizer creates a room from dashboard.
4. Participants join by room code.
5. Organizer starts quiz and moves through questions.
6. Participants answer while a question is active.
7. Leaderboard updates in realtime.
8. Results are saved in PostgreSQL.
