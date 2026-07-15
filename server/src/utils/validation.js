const dns = require("dns").promises;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PASSWORD_MIN_LENGTH = 8;
const COMMON_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "mail.ru",
  "internet.ru",
  "bk.ru",
  "inbox.ru",
  "list.ru",
  "yandex.ru",
  "ya.ru",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "rambler.ru",
  "proton.me",
  "protonmail.com",
]);
const DNS_TEMPORARY_ERRORS = new Set(["ECONNREFUSED", "ETIMEOUT", "EAI_AGAIN", "SERVFAIL"]);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateEmailFormat(email) {
  if (!EMAIL_PATTERN.test(email)) {
    return "Введите корректную почту";
  }

  const domain = email.split("@")[1];

  if (!domain || domain.length > 253 || domain.includes("..")) {
    return "Введите корректную почту";
  }

  return "";
}

async function hasResolvableEmailDomain(email) {
  const domain = email.split("@")[1];

  if (COMMON_EMAIL_DOMAINS.has(domain)) {
    return true;
  }

  const dnsErrors = [];

  try {
    const mxRecords = await dns.resolveMx(domain);

    if (mxRecords.length > 0) {
      return true;
    }
  } catch (error) {
    dnsErrors.push(error.code);
    // Some valid domains do not expose MX but can still accept mail on A/AAAA.
  }

  const [aRecords, aaaaRecords] = await Promise.allSettled([
    dns.resolve4(domain),
    dns.resolve6(domain),
  ]);

  if (aRecords.status === "fulfilled" && aRecords.value.length > 0) {
    return true;
  }

  if (aaaaRecords.status === "fulfilled" && aaaaRecords.value.length > 0) {
    return true;
  }

  if (aRecords.status === "rejected") {
    dnsErrors.push(aRecords.reason?.code);
  }

  if (aaaaRecords.status === "rejected") {
    dnsErrors.push(aaaaRecords.reason?.code);
  }

  return dnsErrors.length > 0 && dnsErrors.every((code) => DNS_TEMPORARY_ERRORS.has(code));
}

function validatePassword(password) {
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

module.exports = {
  hasResolvableEmailDomain,
  normalizeEmail,
  validateEmailFormat,
  validatePassword,
};
