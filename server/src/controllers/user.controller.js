const { prisma } = require("../config/prisma");
const { asyncHandler } = require("../utils/asyncHandler");
const { withDatabaseRetry } = require("../utils/databaseRetry");
const { getCachedData, invalidateCachedData } = require("../utils/dataCache");
const { HttpError } = require("../utils/httpError");
const { deleteOwnedImages } = require("../services/storage.service");

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
  const { organizedRooms, participations } = await getCachedData(`history:${req.user.id}`, async () => {
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
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.roomParticipant.findMany({
          where: { userId: req.user.id },
          select: {
            id: true,
            score: true,
            joinedAt: true,
            room: {
              select: {
                id: true,
                code: true,
                status: true,
                createdAt: true,
                quiz: {
                  select: {
                    id: true,
                    title: true,
                    category: true,
                  },
                },
              },
            },
          },
          orderBy: { joinedAt: "desc" },
        }),
      ]),
      { attempts: 2, baseDelayMs: 250 },
    );

    return { organizedRooms: hosted, participations: played };
  });

  res.json({ organizedRooms, participations });
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
