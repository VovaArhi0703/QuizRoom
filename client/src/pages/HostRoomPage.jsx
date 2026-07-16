import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { invalidateCached } from "../api/queryCache";
import { createSocket } from "../sockets/socket";
import { ParticipantList } from "../components/realtime/ParticipantList";
import { getParticipantsLabel, translateRealtimeError } from "../components/realtime/participant-utils";
import copyIcon from "../assets/Gathering_participants/copy.svg";
import successIcon from "../assets/Gathering_participants/galka_image.svg";
import usersKeyImage from "../assets/Gathering_participants/users_key_image.svg";

export function HostRoomPage() {
  const { roomCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const allowHostLeaveRef = useRef(false);
  const hasHistoryGuardRef = useRef(false);
  const [roomState, setRoomState] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const codeDigits = useMemo(() => String(roomState?.code || roomCode || "").padStart(6, "0").slice(0, 6), [
    roomCode,
    roomState?.code,
  ]);
  const hasParticipants = participants.length > 0;
  const hasFullParticipantsList = participants.length >= 6;
  const isWaiting = !roomState || roomState.status === "WAITING";
  const canStart = isWaiting && hasParticipants;
  const shouldWarnOnLeave = !roomState || roomState.status === "WAITING";

  const closeRoomBeforeLeave = useCallback(
    () =>
      new Promise((resolve) => {
        const socket = socketRef.current;

        if (!socket?.connected) {
          resolve();
          return;
        }

        const timeoutId = window.setTimeout(resolve, 900);

        socket.emit("room:host-leave", { code: roomCode }, () => {
          window.clearTimeout(timeoutId);
          resolve();
        });
      }),
    [roomCode],
  );

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    function joinAsHost() {
      socket.emit("room:host-join", { code: roomCode }, (response) => {
        if (!response?.ok) {
          setError(translateRealtimeError(response?.message, "Не удалось открыть комнату"));
          return;
        }

        setRoomState(response.room);
        setParticipants(response.participants || response.leaderboard || []);
      });
    }

    socket.on("connect", joinAsHost);
    socket.on("room:state", (payload) => {
      setRoomState(payload.room);
      setParticipants(payload.participants || payload.leaderboard || []);
    });
    socket.on("participant:joined", (payload) => {
      setParticipants(payload.participants || payload.leaderboard || []);
    });
    socket.on("leaderboard:updated", (payload) => {
      setParticipants(payload.leaderboard || payload.participants || []);
    });
    socket.on("quiz:finished", (payload) => {
      invalidateCached("/quizzes");
      invalidateCached("/profile/history");
      setRoomState(payload.room);
      setParticipants(payload.participants || payload.leaderboard || []);
    });
    socket.on("room:closed", (payload) => {
      invalidateCached("/quizzes");
      invalidateCached("/profile/history");
      setRoomState(payload.room);
      setError(payload.message || "Комната закрыта");
    });

    socket.connect();

    return () => {
      socket.off("connect", joinAsHost);
      socket.disconnect();
    };
  }, [roomCode]);

  useEffect(() => {
    if (!shouldWarnOnLeave || allowHostLeaveRef.current) {
      return undefined;
    }

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [shouldWarnOnLeave]);

  useEffect(() => {
    if (!shouldWarnOnLeave || allowHostLeaveRef.current) {
      return undefined;
    }

    function handleDocumentClick(event) {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;

      if (!anchor || anchor.target === "_blank" || event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = `${location.pathname}${location.search}${location.hash}`;
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;

      if (nextUrl.origin !== window.location.origin || nextPath === currentUrl) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const confirmed = window.confirm(
        "Если уйти с этого экрана, квиз завершится, а подключённые участники будут отсоединены. Уйти?",
      );

      if (!confirmed) {
        return;
      }

      allowHostLeaveRef.current = true;
      closeRoomBeforeLeave().finally(() => navigate(nextPath));
    }

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [closeRoomBeforeLeave, location.hash, location.pathname, location.search, navigate, shouldWarnOnLeave]);

  useEffect(() => {
    if (!shouldWarnOnLeave || allowHostLeaveRef.current || hasHistoryGuardRef.current) {
      return undefined;
    }

    hasHistoryGuardRef.current = true;
    window.history.pushState({ quizroomHostGuard: true }, "", window.location.href);

    function handlePopState() {
      if (!shouldWarnOnLeave || allowHostLeaveRef.current) {
        return;
      }

      const confirmed = window.confirm(
        "Если уйти с этого экрана, квиз завершится, а подключённые участники будут отсоединены. Уйти?",
      );

      if (!confirmed) {
        window.history.pushState({ quizroomHostGuard: true }, "", window.location.href);
        return;
      }

      allowHostLeaveRef.current = true;
      closeRoomBeforeLeave().finally(() => window.history.back());
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      hasHistoryGuardRef.current = false;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [closeRoomBeforeLeave, shouldWarnOnLeave]);

  function emitWithAck(eventName) {
    setError("");
    socketRef.current?.emit(eventName, { code: roomCode }, (response) => {
      if (!response?.ok) {
        setError(translateRealtimeError(response?.message));
      }
    });
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard?.writeText(codeDigits);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1400);
    } catch {
      setError("Не удалось скопировать код");
    }
  }

  if (roomState?.status === "ACTIVE" || roomState?.status === "FINISHED") {
    const isFinished = roomState.status === "FINISHED";

    return (
      <section className="host-started-screen">
        <article className="host-started-card">
          <div className="host-started-copy">
            <img src={successIcon} alt="" />
            <div>
              <h1>{isFinished ? "Квиз завершён!" : "Квиз успешно начат!"}</h1>
              <p>
                {isFinished
                  ? "Результаты участников готовы. Откройте итоговый лидерборд."
                  : "Участники уже видят первый вопрос. Результаты будут доступны после завершения квиза."}
              </p>
            </div>
          </div>
          <Link className="host-started-button" to={isFinished ? `/results/${roomCode}` : "/quizzes"}>
            {isFinished ? "Посмотреть результаты" : "Вернуться к созданным квизам"}
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="gathering-screen">
      <article
        className={`gathering-card ${hasParticipants ? "has-participants" : "is-empty"} ${
          hasFullParticipantsList ? "has-many-participants" : ""
        }`}
      >
        <header className="gathering-hero">
          <img className="gathering-hero-image" src={usersKeyImage} alt="" />
          <div className="gathering-hero-copy">
            <h1>Соберите участников</h1>
            <p>Отправьте сгенерированный код всем, кого вы хотите пригласить на свой квиз</p>
          </div>
        </header>

        <section className="gathering-code-section" aria-label="Код комнаты">
          <div className="gathering-code-label">
            <span>Код комнаты</span>
            <button className="gathering-copy-button" type="button" onClick={copyRoomCode} aria-label="Скопировать код">
              <img src={copyIcon} alt="" />
            </button>
          </div>
          <div className="gathering-code-box" aria-live="polite">
            {codeDigits.split("").map((digit, index) => (
              <span key={`${digit}-${index}`}>{digit}</span>
            ))}
          </div>
          {isCopied ? <p className="gathering-copy-note">Код скопирован</p> : null}
        </section>

        <section className="gathering-start-section">
          <button className="gathering-start-button" type="button" disabled={!canStart} onClick={() => emitWithAck("room:start")}>
            Начать квиз
          </button>

          <div className="gathering-participants-heading">
            <h2>Подключившиеся участники</h2>
            <span>{getParticipantsLabel(participants.length)}</span>
          </div>

          {hasParticipants ? <ParticipantList participants={participants} /> : <EmptyParticipants />}
        </section>

        {error ? <p className="gathering-error">{error}</p> : null}

      </article>
    </section>
  );
}

function EmptyParticipants() {
  return (
    <div className="gathering-empty-participants">
      <span>Пока никто не подключился</span>
    </div>
  );
}
