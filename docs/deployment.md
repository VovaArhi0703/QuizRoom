# Deployment

## Frontend on Vercel

Root directory:

```text
client
```

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Environment variables:

```env
VITE_API_URL=https://your-render-service.onrender.com/api
VITE_SOCKET_URL=https://your-render-service.onrender.com
```

## Backend on Render

Root directory:

```text
server
```

Build command:

```bash
npm ci && npx prisma generate
```

Start command:

```bash
npm start
```

Environment variables:

```env
DATABASE_URL=postgresql://...
DATABASE_SSL=auto
JWT_SECRET=strong-production-secret
CLIENT_URL=https://your-vercel-app.vercel.app
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://your-render-service.onrender.com/api/auth/google/callback
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_backend_key
SUPABASE_STORAGE_BUCKET=quizroom-media
```

Health check path:

```text
/api/health
```

## Database

Use Supabase Shared Pooler in session mode on port `5432` for the persistent Render backend.
The current Supabase database is already initialized. Future schema changes should be deployed with
Prisma migrations.

```bash
npx prisma migrate deploy
```

Uploaded images are stored in the public Supabase Storage bucket configured by
`SUPABASE_STORAGE_BUCKET`.
