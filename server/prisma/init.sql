DO $$
BEGIN
  CREATE TYPE "UserRole" AS ENUM ('PARTICIPANT', 'ORGANIZER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QuestionType" AS ENUM ('SINGLE', 'MULTIPLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'ACTIVE', 'FINISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT,
  "googleId" TEXT UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "profileColor" TEXT NOT NULL DEFAULT 'violet',
  "avatarUrl" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'PARTICIPANT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Quiz" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "timeLimit" INTEGER NOT NULL DEFAULT 30,
  "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
  "organizerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Quiz_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Question" (
  "id" TEXT PRIMARY KEY,
  "quizId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "imageUrl" TEXT,
  "type" "QuestionType" NOT NULL DEFAULT 'SINGLE',
  "timeLimit" INTEGER NOT NULL DEFAULT 30,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AnswerOption" (
  "id" TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "imageUrl" TEXT,
  "isCorrect" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnswerOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Room" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "quizId" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
  "currentQuestionIndex" INTEGER NOT NULL DEFAULT -1,
  "currentQuestionStartedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Room_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
