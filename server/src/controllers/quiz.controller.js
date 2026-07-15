const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../config/prisma");
const { asyncHandler } = require("../utils/asyncHandler");
const { withDatabaseRetry } = require("../utils/databaseRetry");
const { getCachedData, invalidateCachedData, setCachedData } = require("../utils/dataCache");
const { HttpError } = require("../utils/httpError");
const { deleteOwnedImages } = require("../services/storage.service");

const quizInclude = {
  questions: {
    orderBy: { order: "asc" },
    include: {
      options: {
        orderBy: { createdAt: "asc" },
      },
    },
  },
};

function collectQuizImageUrls(quiz) {
  if (!quiz?.questions) {
    return [];
  }

  return quiz.questions.flatMap((question) => [
    question.imageUrl,
    ...question.options.map((option) => option.imageUrl),
  ]).filter(Boolean);
}

function getRemovedImageUrls(previousQuiz, nextQuiz) {
  const nextUrls = new Set(collectQuizImageUrls(nextQuiz));
  return collectQuizImageUrls(previousQuiz).filter((imageUrl) => !nextUrls.has(imageUrl));
}

async function assertQuizOwner(quizId, userId) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });

  if (!quiz) {
    throw new HttpError(404, "Quiz was not found");
  }

  if (quiz.organizerId !== userId) {
    throw new HttpError(403, "Only quiz owner can change this quiz");
  }

  return quiz;
}

function hideCorrectAnswers(quiz) {
  return {
    ...quiz,
    questions: quiz.questions.map((question) => ({
      ...question,
      options: question.options.map(({ isCorrect, ...option }) => option),
    })),
  };
}

function validateQuestionPayload(question) {
  const options = Array.isArray(question.options) ? question.options : [];

  if (!String(question.text || "").trim()) {
    throw new HttpError(400, "Question text is required");
  }

  if (options.length < 2 || options.some((option) => !String(option.text || "").trim())) {
    throw new HttpError(400, "At least two filled answer options are required");
  }

  if (!options.some((option) => option.isCorrect)) {
    throw new HttpError(400, "At least one correct option is required");
  }
}

const listQuizzes = asyncHandler(async (req, res) => {
  const quizzes = await getCachedData(`quizzes:${req.user.id}`, () =>
    withDatabaseRetry(
      () =>
        prisma.quiz.findMany({
          where: { organizerId: req.user.id },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            timeLimit: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                questions: true,
                rooms: true,
              },
            },
          },
        }),
      { attempts: 2, baseDelayMs: 250 },
    ),
  );

  res.json({ quizzes });
});

const createQuiz = asyncHandler(async (req, res) => {
  const { title, description, category, timeLimit = 30, status = "DRAFT" } = req.body;

  if (!title) {
    throw new HttpError(400, "Quiz title is required");
  }

  const quiz = await prisma.quiz.create({
    data: {
      title,
      description,
      category,
      timeLimit: Number(timeLimit),
      status,
      organizerId: req.user.id,
    },
  });

  invalidateCachedData(`quizzes:${req.user.id}`);

  res.status(201).json({ quiz });
});

const saveQuizContent = asyncHandler(async (req, res) => {
  const isExistingQuiz = Boolean(req.body.id);
  const quizId = req.body.id || randomUUID();
  const quizInput = req.body.quiz || {};
  const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
  const previousQuiz = isExistingQuiz
    ? await prisma.quiz.findFirst({
        where: { id: quizId, organizerId: req.user.id },
        include: quizInclude,
      })
    : null;

  if (!String(quizInput.title || "").trim()) {
    throw new HttpError(400, "Quiz title is required");
  }

  if (questions.length === 0) {
    throw new HttpError(400, "Quiz needs at least one complete question");
  }

  questions.forEach(validateQuestionPayload);

  const quizData = {
    title: String(quizInput.title).trim(),
    description: quizInput.description || "",
    category: quizInput.category || null,
    timeLimit: Number(quizInput.timeLimit) || 120,
    status: quizInput.status || "PUBLISHED",
  };
  const questionRows = questions.map((question, index) => ({
    id: randomUUID(),
    text: String(question.text).trim(),
    imageUrl: question.imageUrl || null,
    type: question.type || "SINGLE",
    timeLimit: Number(question.timeLimit) || 120,
    order: index + 1,
    options: question.options.map((option) => ({
      id: randomUUID(),
      text: String(option.text).trim(),
      imageUrl: option.imageUrl || null,
      isCorrect: Boolean(option.isCorrect),
    })),
  }));
  const serializedQuestions = JSON.stringify(questionRows);

  const savedRows = await withDatabaseRetry(
    () =>
      prisma.$queryRaw(
        Prisma.sql`
              WITH question_input AS (
                SELECT *
                FROM jsonb_to_recordset(${serializedQuestions}::jsonb) AS question(
                  id text,
                  text text,
                  "imageUrl" text,
                  type text,
                  "timeLimit" integer,
                  "order" integer,
                  options jsonb
                )
              ),
              upserted_quiz AS (
                INSERT INTO "Quiz" (
                  "id", "title", "description", "category", "timeLimit", "status",
                  "organizerId", "createdAt", "updatedAt"
                )
                VALUES (
                  ${quizId}, ${quizData.title}, ${quizData.description}, ${quizData.category},
                  ${quizData.timeLimit}, ${quizData.status}::"QuizStatus", ${req.user.id}, NOW(), NOW()
                )
                ON CONFLICT ("id") DO UPDATE SET
                  "title" = EXCLUDED."title",
                  "description" = EXCLUDED."description",
                  "category" = EXCLUDED."category",
                  "timeLimit" = EXCLUDED."timeLimit",
                  "status" = EXCLUDED."status",
                  "updatedAt" = NOW()
                WHERE "Quiz"."organizerId" = ${req.user.id}
                RETURNING "id"
              ),
              deleted_questions AS (
                DELETE FROM "Question"
                WHERE "quizId" IN (SELECT "id" FROM upserted_quiz)
                RETURNING "id"
              ),
              deletion_done AS (
                SELECT COUNT(*) AS count FROM deleted_questions
              ),
              inserted_questions AS (
                INSERT INTO "Question" (
                  "id", "quizId", "text", "imageUrl", "type", "timeLimit", "order",
                  "createdAt", "updatedAt"
                )
                SELECT
                  question.id,
                  upserted_quiz."id",
                  question.text,
                  question."imageUrl",
                  question.type::"QuestionType",
                  question."timeLimit",
                  question."order",
                  NOW(),
                  NOW()
                FROM question_input AS question
                CROSS JOIN upserted_quiz
                CROSS JOIN deletion_done
                RETURNING "id"
              ),
              inserted_options AS (
                INSERT INTO "AnswerOption" (
                  "id", "questionId", "text", "imageUrl", "isCorrect", "createdAt"
                )
                SELECT
                  option.id,
                  question.id,
                  option.text,
                  option."imageUrl",
                  option."isCorrect",
                  NOW()
                FROM question_input AS question
                JOIN inserted_questions ON inserted_questions."id" = question.id
                CROSS JOIN LATERAL jsonb_to_recordset(question.options) AS option(
                  id text,
                  text text,
                  "imageUrl" text,
                  "isCorrect" boolean
                )
                RETURNING "id"
              )
              SELECT upserted_quiz."id"
              FROM upserted_quiz
              CROSS JOIN (SELECT COUNT(*) FROM inserted_options) AS inserted_option_count
        `,
      ),
    { attempts: 2, baseDelayMs: 300 },
  );

  if (savedRows.length === 0) {
    throw new HttpError(404, "Quiz was not found or belongs to another user");
  }

  const savedQuiz = await withDatabaseRetry(
    () =>
      prisma.quiz.findUnique({
        where: { id: quizId },
        include: quizInclude,
      }),
    { attempts: 2, baseDelayMs: 250 },
  );

  invalidateCachedData(`quizzes:${req.user.id}`, `history:${req.user.id}`, `quiz:${quizId}`);
  setCachedData(`quiz:${quizId}`, savedQuiz);
  await deleteOwnedImages(getRemovedImageUrls(previousQuiz, savedQuiz), req.user.id);
  res.status(isExistingQuiz ? 200 : 201).json({ quiz: savedQuiz });
});

const getQuiz = asyncHandler(async (req, res) => {
  const quiz = await getCachedData(`quiz:${req.params.id}`, () =>
    withDatabaseRetry(
      () =>
        prisma.quiz.findUnique({
          where: { id: req.params.id },
          include: quizInclude,
        }),
      { attempts: 2, baseDelayMs: 250 },
    ),
  );

  if (!quiz) {
    throw new HttpError(404, "Quiz was not found");
  }

  const isOwner = quiz.organizerId === req.user.id;
  res.json({ quiz: isOwner ? quiz : hideCorrectAnswers(quiz) });
});

const updateQuiz = asyncHandler(async (req, res) => {
  await assertQuizOwner(req.params.id, req.user.id);

  const { title, description, category, timeLimit, status } = req.body;
  const quiz = await prisma.quiz.update({
    where: { id: req.params.id },
    data: {
      title,
      description,
      category,
      timeLimit: timeLimit === undefined ? undefined : Number(timeLimit),
      status,
    },
  });

  invalidateCachedData(`quizzes:${req.user.id}`, `quiz:${req.params.id}`);

  res.json({ quiz });
});

const deleteQuiz = asyncHandler(async (req, res) => {
  const quiz = await withDatabaseRetry(
    () =>
      prisma.quiz.findFirst({
        where: { id: req.params.id, organizerId: req.user.id },
        include: quizInclude,
      }),
    { attempts: 2, baseDelayMs: 250 },
  );
  const result = await withDatabaseRetry(
    () =>
      prisma.quiz.deleteMany({
        where: {
          id: req.params.id,
          organizerId: req.user.id,
        },
      }),
    { attempts: 3, baseDelayMs: 250 },
  );

  if (result.count > 0) {
    await deleteOwnedImages(collectQuizImageUrls(quiz), req.user.id);
  }

  invalidateCachedData(`quizzes:${req.user.id}`, `history:${req.user.id}`, `quiz:${req.params.id}`);
  res.status(204).send();
});

const createQuestion = asyncHandler(async (req, res) => {
  await assertQuizOwner(req.params.id, req.user.id);

  const { text, imageUrl, type = "SINGLE", timeLimit = 30, order = 0, options = [] } = req.body;

  if (!text) {
    throw new HttpError(400, "Question text is required");
  }

  if (!Array.isArray(options) || options.length < 2) {
    throw new HttpError(400, "At least two answer options are required");
  }

  if (!options.some((option) => option.isCorrect)) {
    throw new HttpError(400, "At least one correct option is required");
  }

  const question = await prisma.question.create({
    data: {
      quizId: req.params.id,
      text,
      imageUrl,
      type,
      timeLimit: Number(timeLimit),
      order: Number(order),
      options: {
        create: options.map((option) => ({
          text: option.text,
          imageUrl: option.imageUrl || null,
          isCorrect: Boolean(option.isCorrect),
        })),
      },
    },
    include: {
      options: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  invalidateCachedData(`quizzes:${req.user.id}`, `quiz:${req.params.id}`);

  res.status(201).json({ question });
});

const updateQuestion = asyncHandler(async (req, res) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.questionId },
    include: { quiz: true, options: true },
  });

  if (!question) {
    throw new HttpError(404, "Question was not found");
  }

  await assertQuizOwner(question.quizId, req.user.id);

  const { text, imageUrl, type, timeLimit, order, options } = req.body;

  const questionWithOptions = await prisma.$transaction(async (tx) => {
    if (Array.isArray(options)) {
      await tx.answerOption.deleteMany({ where: { questionId: req.params.questionId } });
    }

    const updatedQuestion = await tx.question.update({
      where: { id: req.params.questionId },
      data: {
        text,
        imageUrl,
        type,
        timeLimit: timeLimit === undefined ? undefined : Number(timeLimit),
        order: order === undefined ? undefined : Number(order),
      },
    });

    if (Array.isArray(options) && options.length > 0) {
      await tx.answerOption.createMany({
        data: options.map((option) => ({
          questionId: req.params.questionId,
          text: option.text,
          imageUrl: option.imageUrl || null,
          isCorrect: Boolean(option.isCorrect),
        })),
      });
    }

    return tx.question.findUnique({
      where: { id: updatedQuestion.id },
      include: {
        options: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  invalidateCachedData(`quizzes:${req.user.id}`, `quiz:${question.quizId}`);

  const previousImageUrls = [
    question.imageUrl,
    ...question.options.map((option) => option.imageUrl),
  ].filter(Boolean);
  const currentImageUrls = new Set([
    questionWithOptions.imageUrl,
    ...questionWithOptions.options.map((option) => option.imageUrl),
  ].filter(Boolean));
  await deleteOwnedImages(
    previousImageUrls.filter((imageUrl) => !currentImageUrls.has(imageUrl)),
    req.user.id,
  );

  res.json({ question: questionWithOptions });
});

const deleteQuestion = asyncHandler(async (req, res) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.questionId },
    include: { options: true },
  });

  if (!question) {
    throw new HttpError(404, "Question was not found");
  }

  await assertQuizOwner(question.quizId, req.user.id);
  await prisma.question.delete({ where: { id: req.params.questionId } });
  await deleteOwnedImages([
    question.imageUrl,
    ...question.options.map((option) => option.imageUrl),
  ].filter(Boolean), req.user.id);
  invalidateCachedData(`quizzes:${req.user.id}`, `quiz:${question.quizId}`);
  res.status(204).send();
});

module.exports = {
  createQuestion,
  createQuiz,
  deleteQuestion,
  deleteQuiz,
  getQuiz,
  listQuizzes,
  saveQuizContent,
  updateQuestion,
  updateQuiz,
};
