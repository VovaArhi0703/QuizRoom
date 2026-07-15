import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/auth-context";
import logoRegister from "../assets/register/logo_register.svg";
import userRegister from "../assets/register/user_register.svg";
import mailRegister from "../assets/register/mail_register.svg";
import passwordRegister from "../assets/register/password_register.svg";
import eyeRegisterOff from "../assets/register/eye_register_off.svg";
import eyeRegisterOn from "../assets/register/eye_register_on.svg";
import galkaRegister from "../assets/register/galka_register.svg";
import googleRegister from "../assets/register/google_register.svg";
import { getGoogleAuthUrl, normalizeEmail, validateEmail, validatePassword } from "../utils/validation";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    accepted: false,
  });
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    passwordConfirm: false,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const email = normalizeEmail(form.email);
    const emailError = validateEmail(email);

    if (emailError) {
      setError(emailError);
      setIsSubmitting(false);
      return;
    }

    const passwordError = validatePassword(form.password);

    if (passwordError) {
      setError(passwordError);
      setIsSubmitting(false);
      return;
    }

    if (form.password !== form.passwordConfirm) {
      setError("Пароли не совпадают");
      setIsSubmitting(false);
      return;
    }

    if (!form.accepted) {
      setError("Нужно принять условия и политику конфиденциальности");
      setIsSubmitting(false);
      return;
    }

    try {
      await register({
        name: form.name,
        email,
        password: form.password,
      });
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="register-screen">
      <section className="register-card" aria-labelledby="register-title">
        <div className="register-form-area">
          <header className="register-header">
            <div className="register-logo-row">
              <img className="register-logo-mark" src={logoRegister} alt="" />
              <span className="register-logo-text">QuizRoom</span>
            </div>
            <div className="register-title-block">
              <h1 id="register-title">Регистрация</h1>
              <p>Создайте аккаунт, чтобы играть и создавать квизы</p>
            </div>
          </header>

          <form id="register-form" className="register-form" onSubmit={handleSubmit}>
            <RegisterInput
              autoComplete="name"
              icon={userRegister}
              placeholder="Введите имя:"
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
            />
            <RegisterInput
              autoComplete="email"
              icon={mailRegister}
              placeholder="Введите почту"
              type="email"
              value={form.email}
              onChange={(value) => setForm({ ...form, email: value })}
            />
            <RegisterPasswordInput
              autoComplete="new-password"
              icon={passwordRegister}
              isVisible={visiblePasswords.password}
              minLength={8}
              onToggleVisibility={() =>
                setVisiblePasswords((state) => ({ ...state, password: !state.password }))
              }
              placeholder="Введите пароль"
              value={form.password}
              onChange={(value) => setForm({ ...form, password: value })}
            />
            <RegisterPasswordInput
              autoComplete="new-password"
              icon={passwordRegister}
              isVisible={visiblePasswords.passwordConfirm}
              minLength={8}
              onToggleVisibility={() =>
                setVisiblePasswords((state) => ({
                  ...state,
                  passwordConfirm: !state.passwordConfirm,
                }))
              }
              placeholder="Подтвердите пароль"
              value={form.passwordConfirm}
              onChange={(value) => setForm({ ...form, passwordConfirm: value })}
            />

            <label className="register-policy">
              <input
                checked={form.accepted}
                type="checkbox"
                onChange={(event) => setForm({ ...form, accepted: event.target.checked })}
              />
              <span className="register-check" aria-hidden="true">
                {form.accepted ? <img src={galkaRegister} alt="" /> : null}
              </span>
              <span>
                Я принимаю условия и политику <a href="#privacy">конфиденциальности</a>
              </span>
            </label>

            {error ? <p className="register-error">{error}</p> : null}
          </form>
        </div>

        <footer className="register-actions">
          <button className="register-submit" disabled={isSubmitting} form="register-form" type="submit">
            {isSubmitting ? "Создаём..." : "Создать аккаунт"}
          </button>
          <p className="register-login-link">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
          </p>
          <div className="register-divider">
            <span />
            или
            <span />
          </div>
          <button className="register-google" type="button" onClick={() => { window.location.href = getGoogleAuthUrl(); }}>
            <img src={googleRegister} alt="" />
            Продолжить с Google
          </button>
        </footer>
      </section>
    </main>
  );
}

function RegisterInput({
  autoComplete,
  icon,
  minLength,
  onChange,
  placeholder,
  type = "text",
  value,
}) {
  return (
    <label className="register-input">
      <img src={icon} alt="" />
      <input
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder={placeholder}
        required
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function RegisterPasswordInput({
  autoComplete,
  icon,
  isVisible,
  minLength,
  onChange,
  onToggleVisibility,
  placeholder,
  value,
}) {
  return (
    <div className="register-input password-input">
      <img src={icon} alt="" />
      <input
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder={placeholder}
        required
        type={isVisible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="password-visibility"
        type="button"
        aria-label={isVisible ? "Скрыть пароль" : "Показать пароль"}
        onClick={onToggleVisibility}
      >
        <img src={isVisible ? eyeRegisterOn : eyeRegisterOff} alt="" />
      </button>
    </div>
  );
}
