const multer = require("multer");
const { HttpError } = require("../utils/httpError");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    callback(isImage ? null : new HttpError(400, "Only jpg, png and webp images are allowed"), isImage);
  },
});

module.exports = { upload };
