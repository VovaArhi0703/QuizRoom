const { prisma } = require("../config/prisma");
const { asyncHandler } = require("../utils/asyncHandler");
const { withDatabaseRetry } = require("../utils/databaseRetry");
const { getCachedData, invalidateCachedData } = require("../utils/dataCache");
const { HttpError } = require("../utils/httpError");
const { deleteOwnedImages } = require("../services/storage.service");
const {
  countUniqueParticipants,
  dedupeParticipants,
  getEarnedScore,
  sortLeaderboard,
} = require("../utils/participantResults");

const profileColorIds = new Set(["green", "violet", "blue", "yellow", "red"]);

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  profileColor: true,
  avatarUrl: true,
  role: true,
  createdAt: true,
};

const getProfileHistory = asyncHandler(async (req, res) => {
  const history = await getCachedData(`history:${req.user.id}`, async () => {
    const [hosted, played] = await withDatabaseRetry(
      () => Promise.all([
        prisma.room.findMany({
          where: { hostId: req.user.id },
          select: {
            id: true,
            code: true,
            status: true,
            createdAt: true,
            startedAt: true,
            finishedAt: true,
            quiz: {
              select: {
                id: true,
                title: true,
                category: true,
              },
            },
            _count: {
              select: { participants: true },
            },
            participants: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.roomParticipant.findMany({
          where: {
            userId: req.user.id,
            room: { status: "FINISHED" },
          },
          select: {
            id: true,
            userId: true,
            score: true,
            joinedAt: true,
            answers: {
              select: {
                isCorrect: true,
                points: true,
              },
            },
            room: {
              select: {
                id: true,
                code: true,
                status: true,
                createdAt: true,
                finishedAt: true,
                quiz: {
                  select: {
                    id: true,
                    title: true,
                    category: true,
                    _count: {
                      select: { questions: true },
                    },
                  },
                },
                participants: {
                  select: {
                    id: true,
                    userId: true,
                    score: true,
                    joinedAt: true,
                    answers: {
                      select: { points: true },
                    },
                  },
                  orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
                },
              },
            },
          },
          orderBy: { joinedAt: "desc" },
        }),
      ]),
      { attempts: 2, baseDelayMs: 250 },
    );

    const playedByRoom = new Map();

    for (const participation of played) {
      if (participation.userId !== req.user.id) {
        continue;
      }

      const existing = playedByRoom.get(participation.room.id);
      const participationScore = getEarnedScore(participation);
      const existingScore = existing ? getEarnedScore(existing) : -1;
      const shouldReplace =
        !existing ||
        participation.answers.length > existing.answers.length ||
        (
          participation.answers.length === existing.answers.length &&
          participationScore > existingScore
        );

      if (shouldReplace) {
        playedByRoom.set(participation.room.id, participation);
      }
    }

    const participations = [...playedByRoom.values()]
      .map((participation) => {
        const questionCount = participation.room.quiz._count.questions;
        const answeredCount = participation.answers.length;
        const correctAnswers = participation.answers.filter((answer) => answer.isCorrect).length;
        const accuracyBase = Math.max(questionCount, answeredCount, 1);
        const score = getEarnedScore(participation);
        const rankedParticipants = sortLeaderboard(
          dedupeParticipants(participation.room.participants),
        );
        const placeIndex = rankedParticipants.findIndex(
          (participant) =>
            participant.userId === req.user.id ||
            (!participant.userId && participant.id === participation.id),
        );
        const room = { ...participation.room };
        delete room.participants;

        return {
          id: participation.id,
          score,
          joinedAt: participation.joinedAt,
          completedAt: room.finishedAt || participation.joinedAt,
          questionCount,
          answeredCount,
          correctAnswers,
          accuracy: Math.round((correctAnswers / accuracyBase) * 100),
          place: placeIndex >= 0 ? placeIndex + 1 : null,
          participantCount: rankedParticipants.length,
          room,
        };
      })
      .sort((first, second) => new Date(second.completedAt) - new Date(first.completedAt));

    const averageAccuracy = participations.length
      ? Math.round(
          participations.reduce((sum, participation) => sum + participation.accuracy, 0) /
            participations.length,
        )
      : 0;

    return {
      organizedRooms: hosted.map(({ participants, ...room }) => ({
        ...room,
        _count: {
          ...room._count,
          participants: countUniqueParticipants(participants),
        },
      })),
      participations,
      participantStats: {
        quizzesCompleted: participations.length,
        averageAccuracy,
        totalQuestionsAnswered: participations.reduce(
          (sum, participation) => sum + participation.answeredCount,
          0,
        ),
        topOneCount: participations.filter((participation) => participation.place === 1).length,
      },
    };
  });

  res.json(history);
});

const updateProfile = asyncHandler(async (req, res) => {
  const data = {};
  const previousUser = req.body.avatarUrl !== undefined
    ? await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { avatarUrl: true },
      })
    : null;

  if (req.body.name !== undefined) {
    const name = String(req.body.name || "").trim();

    if (name.length < 2) {
      throw new HttpError(400, "Имя должно быть не короче 2 символов");
    }

    data.name = name;
  }

  if (req.body.profileColor !== undefined) {
    const profileColor = String(req.body.profileColor);

    if (!profileColorIds.has(profileColor)) {
      throw new HttpError(400, "Неверный цвет профиля");
    }

    data.profileColor = profileColor;
  }

  if (req.body.avatarUrl !== undefined) {
    const avatarUrl = String(req.body.avatarUrl || "").trim();

    data.avatarUrl = avatarUrl || null;
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: publicUserSelect,
  });

  invalidateCachedData(`profile:${req.user.id}`);

  if (previousUser?.avatarUrl && previousUser.avatarUrl !== user.avatarUrl) {
    await deleteOwnedImages([previousUser.avatarUrl], req.user.id);
  }

  res.json({ user });
});

const deleteProfile = asyncHandler(async (req, res) => {
  const userMedia = await withDatabaseRetry(
    () =>
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          avatarUrl: true,
          quizzes: {
            select: {
              questions: {
                select: {
                  imageUrl: true,
                  options: { select: { imageUrl: true } },
                },
              },
            },
          },
        },
      }),
    { attempts: 2, baseDelayMs: 250 },
  );
  await withDatabaseRetry(
    () =>
      prisma.user.deleteMany({
        where: { id: req.user.id },
      }),
    { attempts: 3, baseDelayMs: 250 },
  );

  invalidateCachedData(`quizzes:${req.user.id}`, `history:${req.user.id}`, `profile:${req.user.id}`);

  const imageUrls = [
    userMedia?.avatarUrl,
    ...(userMedia?.quizzes || []).flatMap((quiz) =>
      quiz.questions.flatMap((question) => [
        question.imageUrl,
        ...question.options.map((option) => option.imageUrl),
      ]),
    ),
  ].filter(Boolean);
  await deleteOwnedImages(imageUrls, req.user.id);

  res.status(204).send();
});

module.exports = { deleteProfile, getProfileHistory, updateProfile };
