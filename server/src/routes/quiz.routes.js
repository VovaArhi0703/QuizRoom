const { Router } = require("express");
const {
  createQuestion,
  createQuiz,
  deleteQuestion,
  deleteQuiz,
  getQuiz,
  listQuizzes,
  saveQuizContent,
  updateQuestion,
  updateQuiz,
} = require("../controllers/quiz.controller");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = Router();

router.use(authMiddleware);

router.get("/", listQuizzes);
router.post("/", createQuiz);
router.post("/save", saveQuizContent);
router.get("/:id", getQuiz);
router.put("/:id", updateQuiz);
router.delete("/:id", deleteQuiz);
router.post("/:id/questions", createQuestion);
router.put("/questions/:questionId", updateQuestion);
router.delete("/questions/:questionId", deleteQuestion);

module.exports = { quizRoutes: router };
