import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/auth-context";
import logoRegister from "../assets/register/logo_register.svg";
import mailRegister from "../assets/register/mail_register.svg";
import passwordRegister from "../assets/register/password_register.svg";
import eyeRegisterOff from "../assets/register/eye_register_off.svg";
import eyeRegisterOn from "../assets/register/eye_register_on.svg";
import googleRegister from "../assets/register/google_register.svg";
import { getGoogleAuthUrl, normalizeEmail, validateEmail } from "../utils/validation";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
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

    try {
      await login({ email, password: form.password });
      navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="register-screen">
      <section className="register-card login-card" aria-labelledby="login-title">
        <div className="register-form-area login-form-area">
          <header className="register-header">
            <div className="register-logo-row">
              <img className="register-logo-mark" src={logoRegister} alt="" />
              <span className="register-logo-text">QuizRoom</span>
            </div>
            <div className="register-title-block">
              <h1 id="login-title">Вход в аккаунт</h1>
              <p>Войдите в аккаунт, чтобы играть и создавать квизы</p>
            </div>
          </header>

          <form id="login-form" className="register-form login-form" onSubmit={handleSubmit}>
            <LoginInput
              autoComplete="email"
              icon={mailRegister}
              placeholder="Введите почту"
              type="email"
              value={form.email}
              onChange={(value) => setForm({ ...form, email: value })}
            />
            <PasswordInput
              autoComplete="current-password"
              icon={passwordRegister}
              isVisible={isPasswordVisible}
              onToggleVisibility={() => setIsPasswordVisible((isVisible) => !isVisible)}
              placeholder="Введите пароль"
              value={form.password}
              onChange={(value) => setForm({ ...form, password: value })}
            />

            {error ? <p className="register-error">{error}</p> : null}
          </form>
        </div>

        <footer className="register-actions">
          <button className="register-submit" disabled={isSubmitting} form="login-form" type="submit">
            {isSubmitting ? "Входим..." : "Войти"}
          </button>
          <p className="register-login-link login-register-link">
            Ещё нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
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

function LoginInput({
  autoComplete,
  icon,
  onChange,
  placeholder,
  type = "text",
  value,
}) {
  return (
    <label className="register-input login-input">
      <img src={icon} alt="" />
      <input
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PasswordInput({
  autoComplete,
  icon,
  isVisible,
  onChange,
  onToggleVisibility,
  placeholder,
  value,
}) {
  return (
    <div className="register-input login-input password-input">
      <img src={icon} alt="" />
      <input
        autoComplete={autoComplete}
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
