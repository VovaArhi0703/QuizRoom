const { Router } = require("express");
const { createRoom, getRoom, getRoomResults } = require("../controllers/room.controller");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = Router();

router.post("/", authMiddleware, createRoom);
router.get("/:code", getRoom);
router.get("/:code/results", getRoomResults);

module.exports = { roomRoutes: router };
