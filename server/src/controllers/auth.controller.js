const bcrypt = require("bcrypt");
const { env } = require("../config/env");
const { prisma } = require("../config/prisma");
const { signToken } = require("../services/token.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { withDatabaseRetry } = require("../utils/databaseRetry");
const { HttpError } = require("../utils/httpError");
const {
  hasResolvableEmailDomain,
  normalizeEmail,
  validateEmailFormat,
  validatePassword,
} = require("../utils/validation");

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  profileColor: true,
  avatarUrl: true,
  role: true,
  createdAt: true,
};

const register = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!name || !email || !password) {
    throw new HttpError(400, "Имя, почта и пароль обязательны");
  }

  if (name.length < 2) {
    throw new HttpError(400, "Имя должно быть не короче 2 символов");
  }

  const emailError = validateEmailFormat(email);

  if (emailError) {
    throw new HttpError(400, emailError);
  }

  const hasEmailDomain = await hasResolvableEmailDomain(email);

  if (!hasEmailDomain) {
    throw new HttpError(400, "Почтовый домен не найден. Укажите существующую почту");
  }

  const passwordError = validatePassword(password);

  if (passwordError) {
    throw new HttpError(400, passwordError);
  }

  const existingUser = await withDatabaseRetry(() => prisma.user.findUnique({ where: { email } }));

  if (existingUser) {
    throw new HttpError(409, "Пользователь с такой почтой уже существует");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await withDatabaseRetry(() =>
    prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "ORGANIZER",
        emailVerified: false,
      },
      select: publicUserSelect,
    }),
  );

  res.status(201).json({
    user,
    token: signToken(user),
  });
});

const login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    throw new HttpError(400, "Почта и пароль обязательны");
  }

  const user = await withDatabaseRetry(() => prisma.user.findUnique({ where: { email } }));

  if (!user) {
    throw new HttpError(401, "Неверная почта или пароль");
  }

  if (!user.passwordHash) {
    throw new HttpError(401, "Этот аккаунт создан через Google. Войдите через Google");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new HttpError(401, "Неверная почта или пароль");
  }

  const publicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profileColor: user.profileColor,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };

  res.json({
    user: publicUser,
    token: signToken(publicUser),
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await withDatabaseRetry(
    () =>
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: publicUserSelect,
      }),
    { attempts: 3, baseDelayMs: 250 },
  );

  if (!user) {
    throw new HttpError(401, "User was not found");
  }

  res.json({ user });
});

const startGoogleAuth = asyncHandler(async (_req, res) => {
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new HttpError(501, "Google вход ещё не настроен: добавьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET");
  }

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

const handleGoogleCallback = asyncHandler(async (req, res) => {
  const { code } = req.query;

  if (!code) {
    throw new HttpError(400, "Google не вернул код авторизации");
  }

  if (!env.googleClientId || !env.googleClientSecret) {
    throw new HttpError(501, "Google вход ещё не настроен");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!tokenResponse.ok) {
    throw new HttpError(401, "Не удалось получить токен Google");
  }

  const tokenData = await tokenResponse.json();
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!profileResponse.ok) {
    throw new HttpError(401, "Не удалось получить профиль Google");
  }

  const profile = await profileResponse.json();
  const email = normalizeEmail(profile.email);

  if (!email || !profile.email_verified) {
    throw new HttpError(401, "Google не подтвердил почту аккаунта");
  }

  const user = await withDatabaseRetry(
    async () => {
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ googleId: profile.sub }, { email }],
        },
        select: {
          ...publicUserSelect,
          googleId: true,
        },
      });

      if (existingUser?.googleId === profile.sub) {
        const { googleId: _googleId, ...publicUser } = existingUser;
        return publicUser;
      }

      if (existingUser) {
        return prisma.user.update({
          where: { id: existingUser.id },
          data: {
            googleId: profile.sub,
            emailVerified: true,
          },
          select: publicUserSelect,
        });
      }

      return prisma.user.create({
        data: {
          name: profile.name || email.split("@")[0],
          email,
          googleId: profile.sub,
          passwordHash: null,
          emailVerified: true,
          role: "ORGANIZER",
        },
        select: publicUserSelect,
      });
    },
    { attempts: 3, baseDelayMs: 400 },
  );

  const token = signToken(user);
  const callbackUrl = new URL("/auth/callback", env.clientUrl.split(",")[0]);
  callbackUrl.searchParams.set("token", token);
  callbackUrl.searchParams.set("user", JSON.stringify(user));

  res.redirect(callbackUrl.toString());
});

module.exports = { handleGoogleCallback, login, me, register, startGoogleAuth };
