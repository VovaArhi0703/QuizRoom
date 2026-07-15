const { Router } = require("express");
const { deleteProfile, getProfileHistory, updateProfile } = require("../controllers/user.controller");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = Router();

router.get("/history", authMiddleware, getProfileHistory);
router.patch("/", authMiddleware, updateProfile);
router.delete("/", authMiddleware, deleteProfile);

module.exports = { userRoutes: router };
