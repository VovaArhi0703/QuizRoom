const { prisma } = require("../config/prisma");
const { generateRoomCode } = require("../utils/roomCode");
const { asyncHandler } = require("../utils/asyncHandler");
const { withDatabaseRetry } = require("../utils/databaseRetry");
const { HttpError } = require("../utils/httpError");
const { invalidateCachedData } = require("../utils/dataCache");
const {
  dedupeParticipants,
  sortLeaderboard,
} = require("../utils/participantResults");

async function createUniqueRoomCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRoomCode();
    const existingRoom = await prisma.room.findUnique({ where: { code } });

    if (!existingRoom) {
      return code;
    }
  }

  throw new HttpError(500, "Could not generate room code");
}

const createRoom = asyncHandler(async (req, res) => {
  const { quizId } = req.body;

  if (!quizId) {
    throw new HttpError(400, "Quiz id is required");
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      _count: {
        select: {
          questions: true,
        },
      },
    },
  });

  if (!quiz) {
    throw new HttpError(404, "Quiz was not found");
  }

  if (quiz.organizerId !== req.user.id) {
    throw new HttpError(403, "Only quiz owner can create a room");
  }

  if (quiz._count.questions === 0) {
    throw new HttpError(400, "Quiz needs at least one question before start");
  }

  const room = await prisma.room.create({
    data: {
      code: await createUniqueRoomCode(),
      quizId,
      hostId: req.user.id,
    },
  });

  invalidateCachedData(`quizzes:${req.user.id}`, `history:${req.user.id}`);

  res.status(201).json({ room });
});

const getRoom = asyncHandler(async (req, res) => {
  const room = await withDatabaseRetry(
    () =>
      prisma.room.findUnique({
        where: { code: req.params.code.toUpperCase() },
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              description: true,
              category: true,
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  profileColor: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: { joinedAt: "asc" },
          },
        },
      }),
    { attempts: 2, baseDelayMs: 250 },
  );

  if (!room) {
    throw new HttpError(404, "Room was not found");
  }

  res.json({ room });
});

const getRoomResults = asyncHandler(async (req, res) => {
  const room = await withDatabaseRetry(
    () =>
      prisma.room.findUnique({
        where: { code: req.params.code.toUpperCase() },
        include: {
          quiz: {
            include: {
              _count: { select: { questions: true } },
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  profileColor: true,
                  avatarUrl: true,
                },
              },
              answers: {
                select: {
                  isCorrect: true,
                  points: true,
                },
              },
            },
            orderBy: [
              { score: "desc" },
              { joinedAt: "asc" },
            ],
          },
        },
      }),
    { attempts: 2, baseDelayMs: 250 },
  );

  if (!room) {
    throw new HttpError(404, "Room was not found");
  }

  const participants = sortLeaderboard(dedupeParticipants(room.participants));

  res.json({
    room: {
      ...room,
      participants,
    },
  });
});

module.exports = { createRoom, getRoom, getRoomResults };
