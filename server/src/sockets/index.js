const { randomUUID } = require("crypto");
const { prisma } = require("../config/prisma");
const { verifyToken } = require("../services/token.service");
const { calculateAnswerScore } = require("../services/scoring.service");
const { invalidateCachedData } = require("../utils/dataCache");
const { withDatabaseRetry } = require("../utils/databaseRetry");

const socketParticipants = new Map();
const socketHostRooms = new Map();
const roomTimers = new Map();
const answerQueues = new Map();
const advancingRooms = new Set();
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

async function getLeaderboard(roomId) {
  return queryDatabase(() => prisma.roomParticipant.findMany({
    where: { roomId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          profileColor: true,
        },
      },
    },
    orderBy: [
      { score: "desc" },
      { joinedAt: "asc" },
    ],
  }));
}

async function getParticipants(roomId) {
  return queryDatabase(() => prisma.roomParticipant.findMany({
    where: { roomId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          profileColor: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  }));
}

function createLeaderboard(participants) {
  return [...participants].sort(
    (left, right) => right.score - left.score || new Date(left.joinedAt) - new Date(right.joinedAt),
  );
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

async function emitCurrentQuestionToSocket(socket, room, loadedQuiz = null) {
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

  socket.emit("quiz:question-started", {
    index: room.currentQuestionIndex,
    total: quiz.questions.length,
    startedAt: room.currentQuestionStartedAt,
    question: publicQuestion(question),
  });
}

function clearRoomTimer(roomId) {
  const timer = roomTimers.get(roomId);

  if (timer) {
    clearTimeout(timer);
    roomTimers.delete(roomId);
  }
}

async function penalizeUnansweredParticipants(roomId, questionId) {
  const participants = await queryDatabase(() => prisma.roomParticipant.findMany({
    where: {
      roomId,
      answers: { none: { questionId } },
    },
    select: { id: true },
  }));

  if (participants.length === 0) {
    return;
  }

  const participantIds = participants.map((participant) => participant.id);
  await queryDatabase(() => prisma.participantAnswer.createMany({
    data: participantIds.map((roomParticipantId) => ({
      id: randomUUID(),
      roomParticipantId,
      questionId,
      selectedOptionIds: [],
      isCorrect: false,
      points: -50,
    })),
    skipDuplicates: true,
  }));
  await queryDatabase(() => prisma.roomParticipant.updateMany({
    where: { id: { in: participantIds } },
    data: { score: { decrement: 50 } },
  }));
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
      await waitForQuestionAnswers(currentQuestion.id);
      await penalizeUnansweredParticipants(room.id, currentQuestion.id);
    }

    const nextIndex = room.currentQuestionIndex + 1;

    if (nextIndex >= room.quiz.questions.length) {
      await finishRoom(io, room);
      return;
    }

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
    advancingRooms.delete(roomId);
  }
}

function runRoomAdvance(io, roomId, attempt = 1) {
  advanceRoom(io, roomId).catch(() => {
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

      if (room?.status === "WAITING") {
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

        let participant = null;

        if (socket.user?.id) {
          participant = await queryDatabase(() => prisma.roomParticipant.findFirst({
            where: {
              roomId: room.id,
              userId: socket.user.id,
            },
            orderBy: { joinedAt: "asc" },
          }));
        }

        if (!participant) {
          const participantId = randomUUID();
          participant = await queryDatabase(() =>
            prisma.roomParticipant.upsert({
              where: { id: participantId },
              create: {
                id: participantId,
                roomId: room.id,
                userId: socket.user?.id,
                guestName: guestName || "Guest",
              },
              update: {},
            },
          ));
        }

        socketParticipants.set(socket.id, participant.id);
        socket.join(room.code);

        const participants = await getParticipants(room.id);
        const leaderboard = createLeaderboard(participants);
        io.to(room.code).emit("participant:joined", { participants, leaderboard });
        broadcastRoomState(io, room, participants);

        if (room.status === "ACTIVE") {
          scheduleRoomProgression(io, room, room.quiz);
          await emitCurrentQuestionToSocket(socket, room, room.quiz);
        }

        callback?.({
          ok: true,
          participant,
          room: {
            id: room.id,
            code: room.code,
            status: room.status,
            currentQuestionIndex: room.currentQuestionIndex,
            currentQuestionStartedAt: room.currentQuestionStartedAt,
            quiz: { id: room.quiz.id, title: room.quiz.title },
          },
        });
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

        if (room?.status === "WAITING") {
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

        const score = calculateAnswerScore(
          { ...question, startedAt },
          Array.isArray(selectedOptionIds) ? selectedOptionIds : [],
        );

        const answerIds = Array.isArray(selectedOptionIds) ? selectedOptionIds : [];
        await queueParticipantAnswer(`${participantId}:${questionId}`, async () => {
          const previousAnswer = await queryDatabase(() => prisma.participantAnswer.findUnique({
            where: {
              roomParticipantId_questionId: {
                roomParticipantId: participantId,
                questionId,
              },
            },
            select: { points: true },
          }));
          const scoreDelta = score.points - (previousAnswer?.points || 0);

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
              isCorrect: score.isCorrect,
              points: score.points,
            },
            update: {
              selectedOptionIds: answerIds,
              isCorrect: score.isCorrect,
              points: score.points,
              answeredAt: new Date(),
            },
          }));

          if (scoreDelta !== 0) {
            await queryDatabase(() => prisma.roomParticipant.update({
              where: { id: participantId },
              data: { score: { increment: scoreDelta } },
            }));
          }
        });

        const leaderboard = await getLeaderboard(room.id);
        io.to(room.code).emit("leaderboard:updated", { leaderboard });
        callback?.({ ok: true, ...score });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("quiz:end", async ({ code } = {}, callback) => {
      try {
        const room = await queryDatabase(() => prisma.room.findUnique({
          where: { code: String(code || "").toUpperCase() },
        }));

        if (!room) {
          throw new Error("Room was not found");
        }

        if (!socket.user || socket.user.id !== room.hostId) {
          throw new Error("Only room host can finish quiz");
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
        socketParticipants.delete(socket.id);
        await removeWaitingParticipant(io, participantId);
        socket.leave(String(code || "").toUpperCase());
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on("disconnect", async () => {
      const participantId = socketParticipants.get(socket.id);
      const hostRoomCode = socketHostRooms.get(socket.id);
      socketParticipants.delete(socket.id);
      socketHostRooms.delete(socket.id);

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
