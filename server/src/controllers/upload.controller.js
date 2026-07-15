const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");
const { deleteOwnedImage, uploadImage } = require("../services/storage.service");

const uploadQuestionImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "Image file is required");
  }

  const imageUrl = await uploadImage({
    file: req.file,
    folder: "questions",
    userId: req.user.id,
  });

  res.status(201).json({ imageUrl });
});

const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, "Image file is required");
  }

  const imageUrl = await uploadImage({
    file: req.file,
    folder: "avatars",
    userId: req.user.id,
  });

  res.status(201).json({ imageUrl });
});

const deleteImage = asyncHandler(async (req, res) => {
  const imageUrl = String(req.body.imageUrl || "").trim();

  if (!imageUrl) {
    throw new HttpError(400, "Image URL is required");
  }

  const deleted = await deleteOwnedImage(imageUrl, req.user.id);

  if (!deleted) {
    throw new HttpError(404, "Image was not found");
  }

  res.status(204).send();
});

module.exports = { deleteImage, uploadAvatar, uploadQuestionImage };
