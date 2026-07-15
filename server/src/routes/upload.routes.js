const { Router } = require("express");
const { deleteImage, uploadAvatar, uploadQuestionImage } = require("../controllers/upload.controller");
const { authMiddleware } = require("../middleware/auth.middleware");
const { upload } = require("../middleware/upload.middleware");

const router = Router();

router.post(
  "/question-image",
  authMiddleware,
  upload.single("image"),
  uploadQuestionImage,
);
router.post("/avatar", authMiddleware, upload.single("image"), uploadAvatar);
router.delete("/image", authMiddleware, deleteImage);

module.exports = { uploadRoutes: router };
