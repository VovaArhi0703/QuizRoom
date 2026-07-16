import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { http } from "../api/http";
import { getCached, invalidateCached } from "../api/queryCache";
import {
  OverviewEmptyState,
  OverviewLoading,
  OverviewStatsPanel,
  QuizTagList,
  QuizThemeIcon,
} from "../components/QuizOverviewUi";
import { formatOverviewDate } from "../utils/overview-format";
import activityIcon from "../assets/created_quizzes_screen/arrow_up.svg";
import quizStatIcon from "../assets/created_quizzes_screen/quiz.svg";
import startStatIcon from "../assets/created_quizzes_screen/start.svg";
import questionStatIcon from "../assets/created_quizzes_screen/question.svg";
import usersIcon from "../assets/created_quizzes_screen/users.svg";
import questionMetaIcon from "../assets/created_quizzes_screen/question_statistic.svg";
import dateIcon from "../assets/created_quizzes_screen/date.svg";
import playMiniIcon from "../assets/created_quizzes_screen/play_mini.svg";
import editIcon from "../assets/created_quizzes_screen/create_mini.svg";
import playIcon from "../assets/created_quizzes_screen/play_big.svg";
import menuIcon from "../assets/created_quizzes_screen/menu.svg";
import createImage from "../assets/created_quizzes_screen/create_image.png";
import leaderboardIcon from "../assets/history_quiz_screen/back_arrow.svg";
import deleteIcon from "../assets/create_quiz/delete_create_quiz.svg";

const emptyStats = { totalQuizzes: 0, activeRooms: 0, totalQuestions: 0, totalParticipants: 0 };

export function CreatedQuizzesPage() {
  const navigate = useNavigate();
  const menuAreaRef = useRef(null);
  const [quizzes, setQuizzes] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [busyQuizId, setBusyQuizId] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCached("/quizzes")
      .then((data) => {
        if (!active) return;
        setQuizzes(data.quizzes || []);
        setStats({ ...emptyStats, ...data.stats });
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const closeOnPointerDown = (event) => {
      if (!menuAreaRef.current?.contains(event.target)) setOpenMenuId(null);
    };
    const closeOnEscape = (event) => { if (event.key === "Escape") setOpenMenuId(null); };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuId]);

  async function launchQuiz(quiz) {
    const openRoom = quiz.rooms?.find((room) => room.status === "WAITING" || room.status === "ACTIVE");
    if (openRoom) {
      navigate(`/host/${openRoom.code}`);
      return;
    }

    setBusyQuizId(quiz.id);
    setError("");
    try {
      const { data } = await http.post("/rooms", { quizId: quiz.id });
      invalidateCached("/quizzes");
      invalidateCached("/profile/history");
      navigate(`/host/${data.room.code}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyQuizId(null);
    }
  }

  function openLeaderboard(quiz) {
    if (!quiz.latestFinishedRoomCode) {
      setError("У этого квиза пока нет завершённого запуска с лидербордом.");
      setOpenMenuId(null);
      return;
    }
    navigate(`/results/${quiz.latestFinishedRoomCode}`);
  }

  async function deleteQuiz(quiz) {
    if (!window.confirm(`Удалить квиз «${quiz.title}» полностью? Это действие нельзя отменить.`)) return;
    setBusyQuizId(quiz.id);
    setError("");
    try {
      await http.delete(`/quizzes/${quiz.id}`);
      invalidateCached("/quizzes");
      invalidateCached("/profile/history");
      setQuizzes((current) => current.filter((item) => item.id !== quiz.id));
      setStats((current) => ({
        ...current,
        totalQuizzes: Math.max(0, current.totalQuizzes - 1),
        activeRooms: Math.max(0, current.activeRooms - (quiz.activeRoomCount || 0)),
        totalQuestions: Math.max(0, current.totalQuestions - (quiz._count?.questions || 0)),
        totalParticipants: Math.max(0, current.totalParticipants - (quiz.participantCount || 0)),
      }));
      setOpenMenuId(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyQuizId(null);
    }
  }

  const statItems = [
    { icon: quizStatIcon, value: stats.totalQuizzes, label: "Всего квизов" },
    { icon: startStatIcon, value: stats.activeRooms, label: "Активных" },
    { icon: questionStatIcon, value: stats.totalQuestions, label: "Всего вопросов" },
    { icon: usersIcon, value: stats.totalParticipants, label: "Прохождений" },
  ];

  return (
    <section className="overview-screen overview-list-screen">
      <div className="overview-hero-row">
        <OverviewStatsPanel
          title="Общая активность"
          description="Управляйте своими квизами и отслеживайте активность"
          icon={activityIcon}
          items={statItems}
        />
        <aside className="overview-action-banner created-action-banner">
          <img src={createImage} alt="" />
          <div>
            <h1>Создать новый квиз</h1>
            <p>Соберите вопросы, настройте правила и запустите игру</p>
            <Link to="/quizzes/new">Создать квиз</Link>
          </div>
        </aside>
      </div>

      {error ? <p className="overview-error" role="alert">{error}</p> : null}
      {isLoading ? <OverviewLoading /> : null}
      {!isLoading && quizzes.length ? (
        <div className="overview-card-grid">
          {quizzes.map((quiz) => (
            <article className="overview-card created-overview-card" key={quiz.id}>
              <div className="overview-card-heading">
                <QuizThemeIcon category={quiz.category} source="created" />
                <div>
                  <h2>{quiz.title}</h2>
                  <div className="overview-tags"><QuizTagList category={quiz.category} /></div>
                </div>
              </div>
              <div className="overview-card-lower">
                <div className="overview-card-meta created-card-meta">
                  <span><img src={questionMetaIcon} alt="" />{quiz._count?.questions || 0} вопросов</span>
                  <span><img src={dateIcon} alt="" />Обновлён {formatOverviewDate(quiz.updatedAt)}</span>
                  <span><img src={playMiniIcon} alt="" />Запусков: {quiz._count?.rooms || 0}</span>
                </div>
                <div className="created-card-actions">
                  <div>
                    <Link to={`/quizzes/${quiz.id}/edit`}><img src={editIcon} alt="" />Редактировать</Link>
                    <button type="button" disabled={busyQuizId === quiz.id} onClick={() => launchQuiz(quiz)}>
                      <img src={playIcon} alt="" />
                      {quiz.activeRoomCount ? "Вернуться" : busyQuizId === quiz.id ? "Запуск..." : "Запустить"}
                    </button>
                  </div>
                  <span className="created-menu-anchor" ref={openMenuId === quiz.id ? menuAreaRef : null}>
                    <button
                      className={`created-menu-button${openMenuId === quiz.id ? " is-open" : ""}`}
                      type="button"
                      aria-expanded={openMenuId === quiz.id}
                      aria-label="Дополнительные действия"
                      onClick={() => setOpenMenuId((current) => current === quiz.id ? null : quiz.id)}
                    >
                      <img src={menuIcon} alt="" />
                    </button>
                    {openMenuId === quiz.id ? (
                      <span className="created-card-menu">
                        <button type="button" onClick={() => openLeaderboard(quiz)}>
                          <img src={leaderboardIcon} alt="" />Посмотреть лидерборд
                        </button>
                        <button type="button" disabled={busyQuizId === quiz.id} onClick={() => deleteQuiz(quiz)}>
                          <img src={deleteIcon} alt="" />Удалить квиз
                        </button>
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {!isLoading && !quizzes.length ? (
        <OverviewEmptyState
          title="Созданных квизов пока нет"
          text="Соберите первый квиз, добавьте вопросы и запустите комнату."
          action={<Link className="overview-primary-action" to="/quizzes/new">Создать квиз</Link>}
        />
      ) : null}
    </section>
  );
}
