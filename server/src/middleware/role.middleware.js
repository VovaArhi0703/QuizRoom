const { HttpError } = require("../utils/httpError");

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, "Not enough permissions"));
      return;
    }

    next();
  };
}

module.exports = { requireRole };
