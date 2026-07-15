const { Client } = require("pg");
require("dotenv").config();

const sql = `
CREATE TABLE IF NOT EXISTS "RoomParticipant" (
  "id" TEXT PRIMARY KEY,
  "roomId" TEXT NOT NULL,
  "userId" TEXT,
  "guestName" TEXT,
  "score" INTEGER NOT NULL DEFAULT 0,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ParticipantAnswer" (
  "id" TEXT PRIMARY KEY,
  "roomParticipantId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "selectedOptionIds" JSONB NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParticipantAnswer_roomParticipantId_fkey" FOREIGN KEY ("roomParticipantId") REFERENCES "RoomParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ParticipantAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Quiz_organizerId_idx" ON "Quiz"("organizerId");
CREATE INDEX IF NOT EXISTS "Question_quizId_idx" ON "Question"("quizId");
CREATE INDEX IF NOT EXISTS "AnswerOption_questionId_idx" ON "AnswerOption"("questionId");
CREATE INDEX IF NOT EXISTS "Room_quizId_idx" ON "Room"("quizId");
CREATE INDEX IF NOT EXISTS "Room_hostId_idx" ON "Room"("hostId");
CREATE INDEX IF NOT EXISTS "RoomParticipant_roomId_idx" ON "RoomParticipant"("roomId");
CREATE INDEX IF NOT EXISTS "RoomParticipant_userId_idx" ON "RoomParticipant"("userId");
CREATE INDEX IF NOT EXISTS "ParticipantAnswer_questionId_idx" ON "ParticipantAnswer"("questionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ParticipantAnswer_roomParticipantId_questionId_key" ON "ParticipantAnswer"("roomParticipantId", "questionId");

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileColor" TEXT NOT NULL DEFAULT 'violet';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "AnswerOption" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
    connectionTimeoutMillis: 30000,
  });

  await client.connect();
  await client.query(sql);
  await client.end();

  console.log("Missing tables initialized");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
