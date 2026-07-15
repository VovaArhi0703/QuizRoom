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
npm install && npx prisma generate
```

Start command:

```bash
npm start
```

Environment variables:

```env
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=strong-production-secret
CLIENT_URL=https://your-vercel-app.vercel.app
UPLOADS_DIR=uploads
```

## Database

Use Neon or Supabase PostgreSQL. After setting `DATABASE_URL`, run:

```bash
npm run prisma:migrate --prefix server
```

For production file uploads, replace local `uploads/` with object storage such as Supabase Storage or S3.
