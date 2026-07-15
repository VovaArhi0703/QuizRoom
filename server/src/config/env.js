const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), quiet: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const env = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL || "auto",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 5000}/api/auth/google/callback`,
  uploadsDir: process.env.UPLOADS_DIR || "uploads",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "quizroom-media",
};

module.exports = { env };
