const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PASSWORD_MIN_LENGTH = 8;

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validateEmail(email) {
  const value = normalizeEmail(email);

  if (!EMAIL_PATTERN.test(value) || value.includes("..")) {
    return "Введите корректную почту";
  }

  return "";
}

export function validatePassword(password) {
  const value = String(password || "");
  const errors = [];

  if (value.length < PASSWORD_MIN_LENGTH) {
    errors.push(`минимум ${PASSWORD_MIN_LENGTH} символов`);
  }

  if (!/[a-zа-яё]/iu.test(value)) {
    errors.push("одна строчная буква");
  }

  if (!/[A-ZА-ЯЁ]/u.test(value)) {
    errors.push("одна заглавная буква");
  }

  if (!/\d/.test(value)) {
    errors.push("одна цифра");
  }

  if (!/[^\p{L}\p{N}\s]/u.test(value)) {
    errors.push("один специальный символ");
  }

  if (errors.length > 0) {
    return `Пароль должен содержать: ${errors.join(", ")}`;
  }

  return "";
}

export function getGoogleAuthUrl() {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

  return `${apiUrl.replace(/\/$/, "")}/auth/google`;
}
