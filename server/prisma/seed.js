const bcrypt = require("bcrypt");
const { prisma } = require("../src/config/prisma");

async function main() {
  console.log("Hashing demo password");
  const passwordHash = await bcrypt.hash("password123", 12);

  console.log("Looking for organizer");
  let organizer = await prisma.user.findUnique({
    where: { email: "organizer@quizroom.local" },
  });

  if (!organizer) {
    console.log("Creating organizer");
    organizer = await prisma.user.create({
      data: {
        name: "Demo Organizer",
        email: "organizer@quizroom.local",
        passwordHash,
        role: "ORGANIZER",
      },
    });
  }

  console.log("Looking for participant");
  const participant = await prisma.user.findUnique({
    where: { email: "participant@quizroom.local" },
  });

  if (!participant) {
    console.log("Creating participant");
    await prisma.user.create({
      data: {
        name: "Demo Participant",
        email: "participant@quizroom.local",
        passwordHash,
        role: "PARTICIPANT",
      },
    });
  }

  console.log("Looking for demo quiz");
  const existingQuiz = await prisma.quiz.findFirst({
    where: {
      title: "Demo Quiz",
      organizerId: organizer.id,
    },
  });

  if (existingQuiz) {
    console.log(`Demo quiz already exists: ${existingQuiz.title}`);
    return;
  }

  console.log("Creating demo quiz");
  const quiz = await prisma.quiz.create({
    data: {
      title: "Demo Quiz",
      description: "A starter quiz for local testing.",
      category: "General",
      status: "PUBLISHED",
      organizerId: organizer.id,
    },
  });

  console.log("Creating demo question");
  const question = await prisma.question.create({
    data: {
      quizId: quiz.id,
      text: "Which protocol powers realtime updates in this project?",
      type: "SINGLE",
      order: 1,
      timeLimit: 30,
    },
  });

  console.log("Creating answer options");
  for (const option of [
    { questionId: question.id, text: "Socket.IO", isCorrect: true },
    { questionId: question.id, text: "SMTP", isCorrect: false },
    { questionId: question.id, text: "FTP", isCorrect: false },
  ]) {
    await prisma.answerOption.create({ data: option });
  }

  console.log(`Seeded demo quiz: ${quiz.title}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
