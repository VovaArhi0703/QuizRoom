const { Router } = require("express");
const {
  handleGoogleCallback,
  login,
  me,
  register,
  startGoogleAuth,
} = require("../controllers/auth.controller");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/google", startGoogleAuth);
router.get("/google/callback", handleGoogleCallback);
router.get("/me", authMiddleware, me);

module.exports = { authRoutes: router };
