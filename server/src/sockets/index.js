const { randomUUID } = require("crypto");
const { prisma } = require("../config/prisma");
const { verifyToken } = require("../services/token.service");
const { calculateAnswerScore } = require("../services/scoring.service");
const { invalidateCachedData } = require("../utils/dataCache");
const { withDatabaseRetry } = require("../utils/databaseRetry");
const {
  dedupeParticipants,
  sortLeaderboard,
} = require("../utils/participantResults");

const socketParticipants = new Map();
const socketParticipantRooms = new Map();
const socketHostRooms = new Map();
const roomTimers = new Map();
const roomAssetReadiness = new Map();
const answerQueues = new Map();
const participantJoinQueues = new Map();
const advancingRooms = new Set();
const closingQuestions = new Set();
const hostDisconnectTimers = new Map();

function queryDatabase(operation) {
  return withDatabaseRetry(operation, { attempts: 2, baseDelayMs: 400 });
}

function publicQuestion(question) {
  if (!question) {
    return null;
  }

  return {
    id: question.id,
    text: question.text,
    imageUrl: question.imageUrl,
    type: question.type,
    timeLimit: question.timeLimit,
    order: question.order,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      imageUrl: option.imageUrl,
    })),
  };
}

function getQuizAssetUrls(quiz) {
  return [...new Set(
    (quiz?.questions || []).flatMap((question) => [
      question.imageUrl,
      ...(question.options || []).map((option) => option.imageUrl),
    ]).filter(Boolean),
  )];
}

function setParticipantAssetReadiness(roomId, participantId, ready) {
  const readiness = roomAssetReadiness.get(roomId) || new Map();
  readiness.set(participantId, Boolean(ready));
  roomAssetReadiness.set(roomId, readiness);
}

function removeParticipantAssetReadiness(roomId, participantId) {
  if (!roomId || !participantId) {
    return;
  }

  const stillConnected = [...socketParticipants.entries()].some(
    ([socketId, connectedParticipantId]) =>
      connectedParticipantId === participantId && socketParticipantRooms.get(socketId) === roomId,
  );

  if (stillConnected) {
    return;
  }

  const readiness = roomAssetReadiness.get(roomId);
  readiness?.delete(participantId);

  if (readiness?.size === 0) {
    roomAssetReadiness.delete(roomId);
  }
}

function getConnectedParticipantIds(roomId) {
  return [...new Set(
    [...socketParticipantRooms.entries()]
      .filter(([, connectedRoomId]) => connectedRoomId === roomId)
      .map(([socketId]) => socketParticipants.get(socketId))
      .filter(Boolean),
  )];
}

async function waitForRoomAssets(roomId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const participantIds = getConnectedParticipantIds(roomId);

    if (participantIds.length === 0) {
      throw new Error("No connected participants in room");
    }

    const readiness = roomAssetReadiness.get(roomId);

    if (participantIds.every((participantId) => readiness?.get(participantId) === true)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Participants are still loading quiz images");
}

async function getLeaderboard(roomId) {
  const participants = await queryDatabase(() => prisma.roomParticipant.findMany({
    where: { roomId },
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
    orderBy: [
      { score: "desc" },
      { joinedAt: "asc" },
    ],
  }));

  return sortLeaderboard(dedupeParticipants(participants));
}

async function getParticipants(roomId) {
  const participants = await queryDatabase(() => prisma.roomParticipant.findMany({
    where: { roomId },
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
  }));

  return dedupeParticipants(participants).sort(
    (left, right) => new Date(left.joinedAt) - new Date(right.joinedAt),
  );
}

function createLeaderboard(participants) {
  return sortLeaderboard(participants);
}

function broadcastRoomState(io, room, participants) {
  const leaderboard = createLeaderboard(participants);

  io.to(room.code).emit("room:state", {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      currentQuestionIndex: room.currentQuestionIndex,
      currentQuestionStartedAt: room.currentQuestionStartedAt,
    },
    participants,
    leaderboard,
  });

  return leaderboard;
}

function invalidateRoomHistory(room, participants = []) {
  invalidateCachedData(`history:${room.hostId}`, `quizzes:${room.hostId}`);

  for (const participant of participants) {
    if (participant.userId) {
      invalidateCachedData(`history:${participant.userId}`);
    }
  }
}

async function emitRoomState(io, room) {
  const participants = await getParticipants(room.id);
  broadcastRoomState(io, room, participants);
}

async function emitCurrentQuestion(io, room, loadedQuiz = null) {
  const quiz =
    loadedQuiz ||
    (await queryDatabase(() => prisma.quiz.findUnique({
      where: { id: room.quizId },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: { options: true },
        },
      },
    })));
  const question = quiz.questions[room.currentQuestionIndex];

  io.to(room.code).emit("quiz:question-started", {
    index: room.currentQuestionIndex,
    total: quiz.questions.length,
    startedAt: room.currentQuestionStartedAt,
    question: publicQuestion(question),
  });
}

async function emitCurrentQuestionToSocket(socket, room, loadedQuiz = null, participantId = null) {
  const quiz =
    loadedQuiz ||
    (await queryDatabase(() => prisma.quiz.findUnique({
      where: { id: room.quizId },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: { options: true },
        },
      },
    })));
  const question = quiz?.questions?.[room.currentQuestionIndex];

  if (!question) {
    return;
  }

  const savedAnswer = participantId
    ? await queryDatabase(() =>
        prisma.participantAnswer.findUnique({
          where: {
            roomParticipantId_questionId: {
              roomParticipantId: participantId,
              questionId: question.id,
            },
          },
          select: { selectedOptionIds: true },
        }),
      )
    : null;

  socket.emit("quiz:question-started", {
    index: room.currentQuestionIndex,
    total: quiz.questions.length,
    startedAt: room.currentQuestionStartedAt,
    question: publicQuestion(question),
    selectedOptionIds: getSelectedOptionIds(savedAnswer),
  });
}

function clearRoomTimer(roomId) {
  const timer = roomTimers.get(roomId);

  if (timer) {
    clearTimeout(timer);
    roomTimers.delete(roomId);
  }
}

function getSelectedOptionIds(answer) {
  return Array.isArray(answer?.selectedOptionIds)
    ? answer.selectedOptionIds.map(String)
    : [];
}

async function finalizeQuestionAnswers(room, question) {
  const startedAt = room.currentQuestionStartedAt || new Date();

  await queryDatabase(() =>
    prisma.$transaction(async (tx) => {
      const participants = await tx.roomParticipant.findMany({
        where: { roomId: room.id },
        include: {
          answers: {
            select: {
              id: true,
              questionId: true,
              selectedOptionIds: true,
              points: true,
              answeredAt: true,
            },
          },
        },
      });

      for (const participant of participants) {
        const currentAnswer = participant.answers.find(
          (answer) => answer.questionId === question.id,
        );
        const selectedOptionIds = getSelectedOptionIds(currentAnswer);
        const score = calculateAnswerScore(
          { ...question, startedAt },
          selectedOptionIds,
          currentAnswer?.answeredAt || new Date(),
        );

        await tx.participantAnswer.upsert({
          where: {
            roomParticipantId_questionId: {
              roomParticipantId: participant.id,
              questionId: question.id,
            },
          },
          create: {
            id: randomUUID(),
            roomParticipantId: participant.id,
            questionId: question.id,
            selectedOptionIds,
            isCorrect: score.isCorrect,
            points: score.points,
          },
          update: {
            selectedOptionIds,
            isCorrect: score.isCorrect,
            points: score.points,
          },
        });

        const previousPoints = participant.answers
          .filter((answer) => answer.questionId !== question.id)
          .reduce((sum, answer) => sum + Math.max(0, Number(answer.points) || 0), 0);

        await tx.roomParticipant.update({
          where: { id: participant.id },
          data: { score: previousPoints + score.points },
        });
      }
    }),
  );
}

async function waitForQuestionAnswers(questionId) {
  const pendingAnswers = [...answerQueues.entries()]
    .filter(([key]) => key.endsWith(`:${questionId}`))
    .map(([, request]) => request.catch(() => {}));

  if (pendingAnswers.length > 0) {
    await Promise.all(pendingAnswers);
  }
}

async function finishRoom(io, room) {
  clearRoomTimer(room.id);
  roomAssetReadiness.delete(room.id);

  const finishedRoom =
    room.status === "FINISHED"
      ? room
      : await queryDatabase(() => prisma.room.update({
          where: { id: room.id },
          data: {
            status: "FINISHED",
            finishedAt: new Date(),
          },
        }));
  const leaderboard = await getLeaderboard(room.id);
  invalidateRoomHistory(room, leaderboard);
  io.to(room.code).emit("quiz:finished", {
    room: finishedRoom,
    participants: leaderboard,
    leaderboard,
  });

  return { room: finishedRoom, leaderboard };
}

async function advanceRoom(io, roomId) {
  if (advancingRooms.has(roomId)) {
    return;
  }

  advancingRooms.add(roomId);
  clearRoomTimer(roomId);
  let closingQuestionId = null;

  try {
    const room = await queryDatabase(() => prisma.room.findUnique({
      where: { id: roomId },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { order: "asc" },
              include: { options: true },
            },
          },
        },
      },
    }));

    if (!room || room.status !== "ACTIVE") {
      return;
    }

    const currentQuestion = room.quiz.questions[room.currentQuestionIndex];

    if (currentQuestion) {
      closingQuestionId = currentQuestion.id;
      closingQuestions.add(closingQuestionId);
      await waitForQuestionAnswers(currentQuestion.id);
      await finalizeQuestionAnswers(room, currentQuestion);
    }

    const nextIndex = room.currentQuestionIndex + 1;

    if (nextIndex >= room.quiz.questions.length) {
      await finishRoom(io, room);
      return;
    }

    const leaderboard = await getLeaderboard(room.id);
    io.to(room.code).emit("leaderboard:updated", {
      leaderboard,
      settledQuestionId: currentQuestion?.id || null,
    });

    const updatedRoom = await queryDatabase(() => prisma.room.update({
      where: { id: room.id },
      data: {
        currentQuestionIndex: nextIndex,
        currentQuestionStartedAt: new Date(),
      },
    }));

    await emitRoomState(io, updatedRoom);
    await emitCurrentQuestion(io, updatedRoom, room.quiz);
    scheduleRoomProgression(io, updatedRoom, room.quiz);
  } finally {
    if (closingQuestionId) {
      closingQuestions.delete(closingQuestionId);
    }
    advancingRooms.delete(roomId);
  }
}

function runRoomAdvance(io, roomId, attempt = 1) {
  advanceRoom(io, roomId).catch((error) => {
    console.error(`Could not advance room ${roomId} (attempt ${attempt}):`, error.message);

    if (attempt >= 4) {
      roomTimers.delete(roomId);
      return;
    }

    const retryDelay = Math.min(750 * attempt, 5_000);
    const retryTimer = setTimeout(() => runRoomAdvance(io, roomId, attempt + 1), retryDelay);
    roomTimers.set(roomId, retryTimer);
  });
}

function scheduleRoomProgression(io, room, loadedQuiz) {
  clearRoomTimer(room.id);

  if (room.status !== "ACTIVE") {
    return;
  }

  const question = loadedQuiz?.questions?.[room.currentQuestionIndex];

  if (!question || !room.currentQuestionStartedAt) {
    return;
  }

  const startedAt = new Date(room.currentQuestionStartedAt).getTime();
  const deadline = startedAt + Math.max(1, question.timeLimit) * 1000;
  const delay = Math.max(100, deadline - Date.now() + 1_300);
  const timer = setTimeout(() => runRoomAdvance(io, room.id), delay);

  roomTimers.set(room.id, timer);
}

function queueParticipantAnswer(key, operation) {
  const previous = answerQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  answerQueues.set(key, current);
  const cleanup = () => {
    if (answerQueues.get(key) === current) {
      answerQueues.delete(key);
    }
  };
  current.then(cleanup, cleanup);

  return current;
}

function queueParticipantJoin(key, operation) {
  const previous = participantJoinQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  participantJoinQueues.set(key, current);
  const cleanup = () => {
    if (participantJoinQueues.get(key) === current) {
      participantJoinQueues.delete(key);
    }
  };
  current.then(cleanup, cleanup);

  return current;
}

async function removeWaitingParticipant(io, participantId) {
  if (!participantId) {
    return;
  }

  if ([...socketParticipants.values()].includes(participantId)) {
    return;
  }

  const participant = await queryDatabase(() => prisma.roomParticipant.findUnique({
    where: { id: participantId },
    include: { room: true },
  }));

  if (!participant || participant.room.status !== "WAITING") {
    return;
  }

  try {
    await queryDatabase(() => prisma.roomParticipant.deleteMany({ where: { id: participant.id } }));
  } catch (_error) {
    return;
  }

  io.to(participant.room.code).emit("participant:left", { participantId: participant.id });
  await emitRoomState(io, participant.room);
}

async function closeRoomByHost(io, code, hostId) {
  const room = await queryDatabase(() => prisma.room.findUnique({
    where: { code: String(code || "").toUpperCase() },
  }));

  if (!room) {
    throw new Error("Room was not found");
  }

  if (hostId && room.hostId !== hostId) {
    throw new Error("Only room host can close this room");
  }

  clearRoomTimer(room.id);
  roomAssetReadiness.delete(room.id);

  const finishedRoom =
    room.status === "FINISHED"
      ? room
      : await queryDatabase(() => prisma.room.update({
          where: { id: room.id },
          data: {
            status: "FINISHED",
            finishedAt: new Date(),
          },
        }));
  const leaderboard = await getLeaderboard(room.id);
  invalidateRoomHistory(room, leaderboard);

  io.to(room.code).emit("room:closed", {
    room: finishedRoom,
    message: "Организатор покинул комнату. Квиз завершён.",
  });
  setTimeout(() => {
    io.in(room.code).disconnectSockets(true);
  }, 100);

  return finishedRoom;
}

function clearHostDisconnectTimer(code) {
  const timer = hostDisconnectTimers.get(code);

  if (timer) {
    clearTimeout(timer);
    hostDisconnectTimers.delete(code);
  }
}

function scheduleHostDisconnect(io, code, hostId) {
  clearHostDisconnectTimer(code);
  const timer = setTimeout(async () => {
    hostDisconnectTimers.delete(code);

    if ([...socketHostRooms.values()].includes(code)) {
      return;
    }

    try {
      const room = await queryDatabase(() => prisma.room.findUnique({ where: { code } }));

      if (room && room.status !== "FINISHED") {
        await closeRoomByHost(io, code, hostId);
      }
    } catch (_error) {
      // A later host action will reconcile the room if the database was temporarily unavailable.
    }
  }, 3_000);

  hostDisconnectTimers.set(code, timer);
}

function registerSockets(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (token) {
        const payload = verifyToken(token);
        socket.user = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
        };
      }

      next();
    } catch (_error) {
      socket.user = null;
      next();
    }
  });

  io.on("connection", (socket) => {
    socket.on("room:host-join", async ({ code } = {}, callback) => {
      try {
        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { code: String(code || "").toUpperCase() },
          include: {
            quiz: {
              include: {
                questions: {
                  orderBy: { order: "asc" },
                  include: { options: true },
                },
              },
            },
          },
        }));

        if (!room) {
          throw new Error("Room was not found");
        }

        if (!socket.user || socket.user.id !== room.hostId) {
          throw new Error("Only room host can open this room");
        }

        socket.join(room.code);
        clearHostDisconnectTimer(room.code);

        if (room.status !== "FINISHED") {
          socketHostRooms.set(socket.id, room.code);
        }

        const participants = await getParticipants(room.id);
        const leaderboard = createLeaderboard(participants);
        const publicRoom = {
          id: room.id,
          code: room.code,
          status: room.status,
          currentQuestionIndex: room.currentQuestionIndex,
          currentQuestionStartedAt: room.currentQuestionStartedAt,
        };

        if (room.status === "ACTIVE") {
          scheduleRoomProgression(io, room, room.quiz);
          await emitCurrentQuestionToSocket(socket, room, room.quiz);
        }

        callback?.({ ok: true, room: publicRoom, participants, leaderboard });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("room:join", async ({ code, guestName } = {}, callback) => {
      try {
        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { code: String(code || "").toUpperCase() },
          include: {
            quiz: {
              include: {
                questions: {
                  orderBy: { order: "asc" },
                  include: { options: true },
                },
              },
            },
          },
        }));

        if (!room) {
          throw new Error("Room was not found");
        }

        if (room.status === "FINISHED") {
          throw new Error("Room is already finished");
        }

        const joinKey = socket.user?.id
          ? `${room.id}:user:${socket.user.id}`
          : `${room.id}:socket:${socket.id}`;
        const participant = await queueParticipantJoin(joinKey, async () => {
          if (socket.user?.id) {
            const existingParticipant = await queryDatabase(() =>
              prisma.roomParticipant.findFirst({
                where: {
                  roomId: room.id,
                  userId: socket.user.id,
                },
                orderBy: { joinedAt: "asc" },
              }),
            );

            if (existingParticipant) {
              return existingParticipant;
            }
          }

          return queryDatabase(() =>
            prisma.roomParticipant.create({
              data: {
                id: randomUUID(),
                roomId: room.id,
                userId: socket.user?.id,
                guestName: socket.user?.id ? null : guestName || "Guest",
              },
            }),
          );
        });

        socketParticipants.set(socket.id, participant.id);
        socketParticipantRooms.set(socket.id, room.id);
        socket.join(room.code);

        const assetUrls = getQuizAssetUrls(room.quiz);

        if (room.status === "WAITING") {
          setParticipantAssetReadiness(room.id, participant.id, assetUrls.length === 0);
        }

        const participants = await getParticipants(room.id);
        const leaderboard = createLeaderboard(participants);
        io.to(room.code).emit("participant:joined", { participants, leaderboard });
        broadcastRoomState(io, room, participants);

        if (room.status === "ACTIVE") {
          scheduleRoomProgression(io, room, room.quiz);
          await emitCurrentQuestionToSocket(socket, room, room.quiz, participant.id);
        }

        callback?.({
          ok: true,
          participant: participants.find((item) => item.id === participant.id) || participant,
          room: {
            id: room.id,
            code: room.code,
            status: room.status,
            currentQuestionIndex: room.currentQuestionIndex,
            currentQuestionStartedAt: room.currentQuestionStartedAt,
            quiz: { id: room.quiz.id, title: room.quiz.title },
          },
          assetUrls,
        });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("room:assets-ready", async ({ code } = {}, callback) => {
      try {
        const participantId = socketParticipants.get(socket.id);
        const roomId = socketParticipantRooms.get(socket.id);

        if (!participantId || !roomId) {
          throw new Error("Participant is not connected to room");
        }

        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { id: roomId },
          select: { code: true, status: true },
        }));

        if (!room || room.code !== String(code || "").toUpperCase() || room.status !== "WAITING") {
          throw new Error("Room is no longer waiting for participants");
        }

        setParticipantAssetReadiness(roomId, participantId, true);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("room:start", async ({ code } = {}, callback) => {
      try {
        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { code: String(code || "").toUpperCase() },
          include: {
            quiz: {
              include: {
                questions: {
                  orderBy: { order: "asc" },
                  include: { options: true },
                },
              },
            },
          },
        }));

        if (!room) {
          throw new Error("Room was not found");
        }

        if (!socket.user || socket.user.id !== room.hostId) {
          throw new Error("Only room host can start quiz");
        }

        if (room.quiz.questions.length === 0) {
          throw new Error("Quiz has no questions");
        }

        if (room.status !== "WAITING") {
          throw new Error("Quiz has already started");
        }

        const participantsCount = await queryDatabase(() => prisma.roomParticipant.count({
          where: { roomId: room.id },
        }));

        if (participantsCount === 0) {
          throw new Error("At least one participant is required");
        }

        await waitForRoomAssets(room.id);

        const updatedRoom = await queryDatabase(() => prisma.room.update({
          where: { id: room.id },
          data: {
            status: "ACTIVE",
            currentQuestionIndex: 0,
            currentQuestionStartedAt: new Date(),
            startedAt: room.startedAt || new Date(),
          },
        }));

        await emitRoomState(io, updatedRoom);
        await emitCurrentQuestion(io, updatedRoom, room.quiz);
        scheduleRoomProgression(io, updatedRoom, room.quiz);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("room:host-leave", async ({ code } = {}, callback) => {
      try {
        if (!socket.user) {
          throw new Error("Only room host can close this room");
        }

        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { code: String(code || "").toUpperCase() },
        }));

        socketHostRooms.delete(socket.id);

        if (room && room.status !== "FINISHED") {
          await closeRoomByHost(io, code, socket.user.id);
        } else if (room) {
          socket.leave(room.code);
        }
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("quiz:next-question", async ({ code } = {}, callback) => {
      try {
        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { code: String(code || "").toUpperCase() },
        }));

        if (!room) {
          throw new Error("Room was not found");
        }

        if (!socket.user || socket.user.id !== room.hostId) {
          throw new Error("Only room host can move quiz forward");
        }

        await advanceRoom(io, room.id);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("quiz:submit-answer", async ({ code, questionId, selectedOptionIds } = {}, callback) => {
      try {
        const participantId = socketParticipants.get(socket.id);

        if (!participantId) {
          throw new Error("Join room before submitting answers");
        }

        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { code: String(code || "").toUpperCase() },
          include: {
            quiz: {
              include: {
                questions: {
                  orderBy: { order: "asc" },
                  include: { options: true },
                },
              },
            },
          },
        }));

        if (!room || room.status !== "ACTIVE") {
          throw new Error("Room is not active");
        }

        const question = room.quiz.questions[room.currentQuestionIndex];

        if (!question || question.id !== questionId) {
          throw new Error("This question is not active");
        }

        const startedAt = room.currentQuestionStartedAt;
        const deadline = new Date(startedAt.getTime() + question.timeLimit * 1000 + 1_200);

        if (new Date() > deadline) {
          throw new Error("Answer time is over");
        }

        const validOptionIds = new Set(question.options.map((option) => option.id));
        const answerIds = [...new Set(
          (Array.isArray(selectedOptionIds) ? selectedOptionIds : [])
            .map(String)
            .filter((optionId) => validOptionIds.has(optionId)),
        )];

        if (question.type === "SINGLE" && answerIds.length > 1) {
          throw new Error("Only one answer can be selected");
        }

        if (closingQuestions.has(questionId)) {
          throw new Error("Answer time is over");
        }

        await queueParticipantAnswer(`${participantId}:${questionId}`, async () => {
          await queryDatabase(() => prisma.participantAnswer.upsert({
            where: {
              roomParticipantId_questionId: {
                roomParticipantId: participantId,
                questionId,
              },
            },
            create: {
              roomParticipantId: participantId,
              questionId,
              selectedOptionIds: answerIds,
              isCorrect: false,
              points: 0,
            },
            update: {
              selectedOptionIds: answerIds,
              isCorrect: false,
              points: 0,
              answeredAt: new Date(),
            },
          }));
        });

        callback?.({ ok: true, saved: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("quiz:end", async ({ code } = {}, callback) => {
      try {
        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { code: String(code || "").toUpperCase() },
          include: {
            quiz: {
              include: {
                questions: {
                  orderBy: { order: "asc" },
                  include: { options: true },
                },
              },
            },
          },
        }));

        if (!room) {
          throw new Error("Room was not found");
        }

        if (!socket.user || socket.user.id !== room.hostId) {
          throw new Error("Only room host can finish quiz");
        }

        const currentQuestion = room.quiz.questions[room.currentQuestionIndex];

        if (room.status === "ACTIVE" && currentQuestion) {
          clearRoomTimer(room.id);
          closingQuestions.add(currentQuestion.id);
          try {
            await waitForQuestionAnswers(currentQuestion.id);
            await finalizeQuestionAnswers(room, currentQuestion);
            const leaderboard = await getLeaderboard(room.id);
            io.to(room.code).emit("leaderboard:updated", {
              leaderboard,
              settledQuestionId: currentQuestion.id,
            });
          } finally {
            closingQuestions.delete(currentQuestion.id);
          }
        }

        await finishRoom(io, room);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("room:leave", async ({ code } = {}, callback) => {
      try {
        const participantId = socketParticipants.get(socket.id);
        const roomId = socketParticipantRooms.get(socket.id);
        socketParticipants.delete(socket.id);
        socketParticipantRooms.delete(socket.id);
        removeParticipantAssetReadiness(roomId, participantId);
        await removeWaitingParticipant(io, participantId);
        socket.leave(String(code || "").toUpperCase());
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("disconnect", async () => {
      const participantId = socketParticipants.get(socket.id);
      const participantRoomId = socketParticipantRooms.get(socket.id);
      const hostRoomCode = socketHostRooms.get(socket.id);
      socketParticipants.delete(socket.id);
      socketParticipantRooms.delete(socket.id);
      socketHostRooms.delete(socket.id);
      removeParticipantAssetReadiness(participantRoomId, participantId);

      try {
        if (participantId) {
          setTimeout(() => {
            removeWaitingParticipant(io, participantId).catch(() => {});
          }, 2_000);
        }

        if (hostRoomCode && socket.user?.id) {
          scheduleHostDisconnect(io, hostRoomCode, socket.user.id);
        }
      } catch (_error) {
        // The socket is already gone; the next room state emission will correct stale clients.
      }
    });
  });
}

module.exports = { registerSockets };
