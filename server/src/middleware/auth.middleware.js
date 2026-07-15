const { verifyToken } = require("../services/token.service");
const { HttpError } = require("../utils/httpError");

async function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");

  if (!token) {
    next(new HttpError(401, "Authorization token is required"));
    return;
  }

  let payload;

  try {
    payload = verifyToken(token);
  } catch {
    next(new HttpError(401, "Invalid authorization token"));
    return;
  }

  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
  };
  next();
}

module.exports = { authMiddleware };
