import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/auth-context";
import attentionIcon from "../assets/connection/attention_connection.svg";
import codeIcon from "../assets/connection/code_connection.svg";
import connectionImage from "../assets/connection/connection_image.svg";
import gameIcon from "../assets/connection/game_connection.svg";
import userMiniIcon from "../assets/connection/user_mini_connection.svg";
import userNameIcon from "../assets/connection/user_name_connection.svg";

export function JoinRoomPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRefs = useRef([]);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [guestName, setGuestName] = useState(user?.name || "");
  const [error, setError] = useState("");
  const roomCode = useMemo(() => digits.join(""), [digits]);

  function applyDigits(value, startIndex = 0) {
    const incoming = String(value).replace(/\D/g, "").slice(0, 6 - startIndex);

    if (!incoming) {
      return;
    }

    setDigits((current) => {
      const next = [...current];
      incoming.split("").forEach((digit, offset) => {
        next[startIndex + offset] = digit;
      });
      return next;
    });

    const nextIndex = Math.min(5, startIndex + incoming.length);
    window.requestAnimationFrame(() => inputRefs.current[nextIndex]?.focus());
  }

  function handleDigitChange(index, value) {
    if (value.length > 1) {
      applyDigits(value, index);
      return;
    }

    const digit = value.replace(/\D/g, "");
    setDigits((current) => current.map((item, itemIndex) => (itemIndex === index ? digit : item)));

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((current) => current.map((item, itemIndex) => (itemIndex === index - 1 ? "" : item)));
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (roomCode.length !== 6) {
      setError("Введите шестизначный код комнаты");
      const emptyIndex = digits.findIndex((digit) => !digit);
      inputRefs.current[emptyIndex >= 0 ? emptyIndex : 0]?.focus();
      return;
    }

    if (!guestName.trim()) {
      setError("Укажите имя участника");
      return;
    }

    sessionStorage.setItem("quizroom_guest_name", guestName.trim());
    navigate(`/play/${roomCode}`);
  }

  return (
    <section className="connection-screen">
      <form className="connection-card" onSubmit={handleSubmit}>
        <header className="connection-hero">
          <img src={connectionImage} alt="" />
          <div>
            <h1>Подключение к комнате</h1>
            <p>Введите код комнаты и имя, чтобы присоединиться к квизу в реальном времени</p>
          </div>
        </header>

        <div className="connection-fields">
          <label className="connection-code-field">
            <span>Код комнаты</span>
            <div className="connection-code-inputs" onPaste={(event) => {
              event.preventDefault();
              applyDigits(event.clipboardData.getData("text"));
            }}>
              {digits.map((digit, index) => (
                <input
                  aria-label={`Цифра ${index + 1} кода комнаты`}
                  autoFocus={index === 0}
                  inputMode="numeric"
                  key={index}
                  maxLength={1}
                  ref={(element) => {
                    inputRefs.current[index] = element;
                  }}
                  value={digit}
                  onChange={(event) => handleDigitChange(index, event.target.value)}
                  onKeyDown={(event) => handleDigitKeyDown(index, event)}
                />
              ))}
            </div>
          </label>

          <div className="connection-name-group">
            <label className="connection-name-field">
              <span>Ваше имя</span>
              <div>
                <input maxLength={60} value={guestName} onChange={(event) => setGuestName(event.target.value)} />
                <img src={userNameIcon} alt="" />
              </div>
            </label>

            <p className="connection-hint">
              <img src={attentionIcon} alt="" />
              Код выдаёт организатор перед началом квиза
            </p>
          </div>
        </div>

        <div className="connection-footer">
          {error ? <p className="connection-error" role="alert">{error}</p> : null}

          <div className="connection-actions">
            <button type="submit">Подключиться</button>
            <Link to="/quizzes/new">Создать свою комнату</Link>
          </div>

          <section className="connection-guide">
            <div className="connection-guide-title">
              <span />
              <h2>Как подключиться к квизу</h2>
              <span />
            </div>
            <div className="connection-guide-steps">
              <ConnectionStep icon={codeIcon} number="1" title="Введите код" text="Введите код для подключения" />
              <ConnectionStep icon={userMiniIcon} number="2" title="Укажите имя" text="Укажите своё имя для других игроков" />
              <ConnectionStep icon={gameIcon} number="3" title="Подключитесь к игре" text="Подключайтесь и играйте" />
            </div>
          </section>
        </div>
      </form>
    </section>
  );
}

function ConnectionStep({ icon, number, text, title }) {
  return (
    <article className="connection-step">
      <div>
        <span>{number}</span>
        <strong>{title}</strong>
      </div>
      <div>
        <span className="connection-step-icon">
          <img src={icon} alt="" />
        </span>
        <p>{text}</p>
      </div>
    </article>
  );
}
