import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ParticipantList } from "../components/realtime/ParticipantList";
import { getParticipantsLabel, translateRealtimeError } from "../components/realtime/participant-utils";
import { useAuth } from "../features/auth/auth-context";
import { createSocket } from "../sockets/socket";
import { resolveUploadUrl } from "../utils/uploads";
import hourglassIcon from "../assets/connection/connection_hourglass.svg";
import singleSelectedIcon from "../assets/quiz/answer_off_quiz.svg";
import singleIdleIcon from "../assets/quiz/answer_on_quiz.svg";
import answerSelectedIcon from "../assets/quiz/galka_otvet.svg";
import answerIdleIcon from "../assets/quiz/krest_otvet.svg";
import multipleIdleIcon from "../assets/quiz/multiple_choice_off_quiz.svg";
import multipleSelectedIcon from "../assets/quiz/multiple_choice_on_quiz.svg";
import questionIcon from "../assets/quiz/student_quiz.svg";
import timeIcon from "../assets/quiz/time_quiz.svg";

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function getTimeLeft(payload) {
  if (!payload?.question || !payload.startedAt) {
    return 0;
  }

  const deadline = new Date(payload.startedAt).getTime() + payload.question.timeLimit * 1000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function PlayRoomPage() {
  const { roomCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socketRef = useRef(null);
  const participantIdRef = useRef(null);
  const allowLeaveRef = useRef(false);
  const historyGuardRef = useRef(false);
  const [roomState, setRoomState] = useState(null);
  const [quizTitle, setQuizTitle] = useState("Квиз");
  const [participant, setParticipant] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [questionPayload, setQuestionPayload] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [answerState, setAnswerState] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState("");

  const question = questionPayload?.question;
  const isMultiple = question?.type === "MULTIPLE";
  const shouldWarnOnLeave = Boolean(participant) && roomState?.status !== "FINISHED";
  const ownLeaderboardIndex = leaderboard.findIndex(
    (item) => item.id === participant?.id || (user?.id && item.userId === user.id),
  );
  const ownParticipant = ownLeaderboardIndex >= 0 ? leaderboard[ownLeaderboardIndex] : participant;
  const totalQuestions = questionPayload?.total || 0;
  const progress = question ? Math.max(0, Math.min(100, (secondsLeft / Math.max(1, question.timeLimit)) * 100)) : 0;
  const possibleScore = totalQuestions * 115;

  const leaveRoomBeforeNavigation = useCallback(
    () =>
      new Promise((resolve) => {
        const socket = socketRef.current;

        if (!socket?.connected) {
          resolve();
          return;
        }

        const timeout = window.setTimeout(resolve, 900);
        socket.emit("room:leave", { code: roomCode }, () => {
          window.clearTimeout(timeout);
          resolve();
        });
      }),
    [roomCode],
  );

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    function joinAsParticipant() {
      socket.emit(
        "room:join",
        {
          code: roomCode,
          guestName: sessionStorage.getItem("quizroom_guest_name") || user?.name || "Участник",
        },
        (response) => {
          if (!response?.ok) {
            setError(translateRealtimeError(response?.message, "Не удалось подключиться к комнате"));
            return;
          }

          setParticipant(response.participant);
          participantIdRef.current = response.participant.id;
          setRoomState(response.room);
          setQuizTitle(response.room?.quiz?.title || "Квиз");
          sessionStorage.setItem(`quizroom_participant_${roomCode}`, response.participant.id);
        },
      );
    }

    socket.on("connect", joinAsParticipant);
    socket.on("room:state", (payload) => {
      setRoomState(payload.room);
      setParticipants(payload.participants || []);
      setLeaderboard(payload.leaderboard || []);
    });
    socket.on("participant:joined", (payload) => {
      setParticipants(payload.participants || []);
      setLeaderboard(payload.leaderboard || []);
    });
    socket.on("participant:left", ({ participantId }) => {
      setParticipants((current) => current.filter((item) => item.id !== participantId));
    });
    socket.on("quiz:question-started", (payload) => {
      setQuestionPayload(payload);
      setSelectedIds([]);
      setAnswerState(null);
      setSecondsLeft(getTimeLeft(payload));
      setError("");
    });
    socket.on("leaderboard:updated", (payload) => setLeaderboard(payload.leaderboard || []));
    socket.on("quiz:finished", (payload) => {
      allowLeaveRef.current = true;
      setRoomState(payload.room);
      setLeaderboard(payload.leaderboard || []);
      setQuestionPayload(null);
      navigate(`/results/${roomCode}`, {
        replace: true,
        state: { participantId: participantIdRef.current },
      });
    });
    socket.on("room:closed", (payload) => {
      allowLeaveRef.current = true;
      setRoomState(payload.room);
      setQuestionPayload(null);
      setError(payload.message || "Организатор закрыл комнату");
    });

    socket.connect();

    return () => {
      socket.off("connect", joinAsParticipant);
      socket.disconnect();
    };
  }, [navigate, roomCode, user?.id, user?.name]);

  useEffect(() => {
    if (!questionPayload) {
      return undefined;
    }

    const updateTimer = () => setSecondsLeft(getTimeLeft(questionPayload));
    updateTimer();
    const interval = window.setInterval(updateTimer, 250);

    return () => window.clearInterval(interval);
  }, [questionPayload]);

  useEffect(() => {
    if (!shouldWarnOnLeave || allowLeaveRef.current) {
      return undefined;
    }

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldWarnOnLeave]);

  useEffect(() => {
    if (!shouldWarnOnLeave || allowLeaveRef.current) {
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
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;

      if (nextUrl.origin !== window.location.origin || currentPath === nextPath) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!window.confirm("Покидая этот экран, вы покинете квиз. Уйти?")) {
        return;
      }

      allowLeaveRef.current = true;
      leaveRoomBeforeNavigation().finally(() => navigate(nextPath));
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [leaveRoomBeforeNavigation, location.hash, location.pathname, location.search, navigate, shouldWarnOnLeave]);

  useEffect(() => {
    if (!shouldWarnOnLeave || allowLeaveRef.current || historyGuardRef.current) {
      return undefined;
    }

    historyGuardRef.current = true;
    window.history.pushState({ quizroomParticipantGuard: true }, "", window.location.href);

    function handlePopState() {
      if (allowLeaveRef.current) {
        return;
      }

      if (!window.confirm("Покидая этот экран, вы покинете квиз. Уйти?")) {
        window.history.pushState({ quizroomParticipantGuard: true }, "", window.location.href);
        return;
      }

      allowLeaveRef.current = true;
      leaveRoomBeforeNavigation().finally(() => window.history.back());
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      historyGuardRef.current = false;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [leaveRoomBeforeNavigation, shouldWarnOnLeave]);

  function saveAnswer(nextSelectedIds) {
    if (!question || secondsLeft <= 0) {
      return;
    }

    setAnswerState({ saving: true });
    socketRef.current?.emit(
      "quiz:submit-answer",
      { code: roomCode, questionId: question.id, selectedOptionIds: nextSelectedIds },
      (response) => {
        if (response?.ok) {
          setAnswerState(response);
          return;
        }

        if (response?.message !== "Answer time is over") {
          setError(translateRealtimeError(response?.message, "Не удалось сохранить ответ"));
        }
      },
    );
  }

  function toggleOption(optionId) {
    if (!question || secondsLeft <= 0) {
      return;
    }

    let nextSelectedIds;

    if (!isMultiple) {
      nextSelectedIds = [optionId];
    } else {
      nextSelectedIds = selectedIds.includes(optionId)
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId];
    }

    setSelectedIds(nextSelectedIds);
    saveAnswer(nextSelectedIds);
  }

  if (error && !participant) {
    return (
      <section className="realtime-state-screen">
        <article className="realtime-message-card">
          <h1>Не удалось подключиться</h1>
          <p>{error}</p>
          <Link to="/join">Вернуться к вводу кода</Link>
        </article>
      </section>
    );
  }

  if (roomState?.status === "FINISHED" && error) {
    return (
      <section className="realtime-state-screen">
        <article className="realtime-message-card">
          <h1>Квиз завершён</h1>
          <p>{error}</p>
          <Link to="/dashboard">На главную</Link>
        </article>
      </section>
    );
  }

  if (!roomState || roomState.status === "WAITING") {
    return (
      <section className="participant-waiting-screen">
        <article className="participant-waiting-card">
          <header className="participant-waiting-hero">
            <img src={hourglassIcon} alt="" />
            <div>
              <h1>Ожидание начала квиза</h1>
              <p>Организатор ещё не запустил квиз. Пожалуйста, подождите</p>
            </div>
          </header>
          <section className="participant-waiting-list">
            <div className="gathering-participants-heading">
              <h2>Подключившиеся участники</h2>
              <span>{getParticipantsLabel(participants.length)}</span>
            </div>
            {participants.length ? (
              <ParticipantList participants={participants} className="participant-list-card" />
            ) : (
              <div className="participant-joining-placeholder">Подключаемся к комнате...</div>
            )}
          </section>
          {error ? <p className="connection-error">{error}</p> : null}
        </article>
      </section>
    );
  }

  if (!question) {
    return (
      <section className="realtime-state-screen">
        <article className="realtime-message-card">
          <h1>Квиз начинается</h1>
          <p>Первый вопрос появится через мгновение.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="quiz-play-screen">
      <header className="quiz-play-summary">
        <div>
          <p><strong>Название комнаты:</strong> {quizTitle}</p>
          <span>Возможное количество баллов: {possibleScore}</span>
        </div>
        <div className="quiz-current-place">
          <strong>{ownLeaderboardIndex >= 0 ? ownLeaderboardIndex + 1 : "—"}</strong>
          <span>Текущее<br />место</span>
          <p>Баллов: {ownParticipant?.score || 0}</p>
        </div>
      </header>

      <article className="quiz-question-card">
        <header className="quiz-question-heading">
          <div>
            <span><img src={questionIcon} alt="" />Вопрос {questionPayload.index + 1}</span>
            <time><img src={timeIcon} alt="" />{formatTime(secondsLeft)}</time>
          </div>
          <h1>{question.text}</h1>
        </header>

        <div className="quiz-question-content">
          <div className={`quiz-answer-list ${question.options.some((option) => option.imageUrl) ? "has-images" : ""}`}>
            {question.options.map((option) => {
              const selected = selectedIds.includes(option.id);
              const marker = isMultiple
                ? selected ? multipleSelectedIcon : multipleIdleIcon
                : selected ? singleSelectedIcon : singleIdleIcon;

              return (
                <button
                  className={selected ? "quiz-answer selected" : "quiz-answer"}
                  disabled={secondsLeft <= 0}
                  key={option.id}
                  type="button"
                  onClick={() => toggleOption(option.id)}
                >
                  <img className="quiz-answer-marker" src={marker} alt="" />
                  <span>
                    <strong>{option.text}</strong>
                    {option.imageUrl ? <img src={resolveUploadUrl(option.imageUrl)} alt="" /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <aside className="quiz-progress-column">
            <div className="quiz-progress-card">
              <p>Осталось вопросов: <strong>{Math.max(0, questionPayload.total - questionPayload.index - 1)}</strong></p>
              <div>
                <span>{selectedIds.length ? "Ответ выбран" : "Ответ не выбран"}</span>
                <img src={selectedIds.length ? answerSelectedIcon : answerIdleIcon} alt="" />
                <div className="quiz-timer-track"><span style={{ width: `${progress}%` }} /></div>
              </div>
              {answerState?.saving ? <small>Сохраняем ответ...</small> : null}
            </div>
            {question.imageUrl ? <img className="quiz-main-image" src={resolveUploadUrl(question.imageUrl)} alt="" /> : null}
          </aside>
        </div>
      </article>

      {error ? <p className="connection-error">{error}</p> : null}
    </section>
  );
}
