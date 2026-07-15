import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, FileQuestion, History, Pencil, Trophy, UsersRound } from "lucide-react";
import { getCached } from "../api/queryCache";
import { useAuth } from "../features/auth/auth-context";
import { getDisplayId } from "../utils/display-id";

export function DashboardPage() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
  const [history, setHistory] = useState({ organizedRooms: [], participations: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      try {
        const [quizData, historyData] = await Promise.all([
          getCached("/quizzes"),
          getCached("/profile/history"),
        ]);

        if (!isActive) {
          return;
        }

        setQuizzes(quizData.quizzes);
        setHistory(historyData);
      } catch (requestError) {
        if (isActive) {
          setError(requestError.message);
        }
      }
    }

    loadDashboard();

    return () => {
      isActive = false;
    };
  }, []);

  const stats = useMemo(() => {
    const questions = quizzes.reduce((sum, quiz) => sum + (quiz._count?.questions || 0), 0);
    const hosted = history.organizedRooms.length;
    const played = history.participations.length;
    const bestScore = history.participations.reduce((max, item) => Math.max(max, item.score), 0);

    return { questions, hosted, played, bestScore };
  }, [history, quizzes]);

  return (
    <section className="content-stack">
      {error ? <p className="error-text">{error}</p> : null}

      <div className="dashboard-grid">
        <article className="panel profile-summary">
          <div className="avatar-circle">{user?.name?.[0]?.toUpperCase() || "Q"}</div>
          <div>
            <h1>{user?.name}</h1>
            <p className="muted">ID:{getDisplayId(user?.id)}</p>
            <Link className="primary-button compact" to="/profile">
              <Pencil size={16} />
              Редактировать профиль
            </Link>
          </div>
          <div className="progress-ring">
            <strong>{stats.played ? "76%" : "0%"}</strong>
            <span>Средний результат</span>
          </div>
        </article>

        <aside className="panel dark-callout">
          <p className="pill">Совет QuizRoom</p>
          <h2>Как подняться в лидерборде?</h2>
          <p>Отвечайте не только правильно, но и быстрее. Скорость влияет на итоговые баллы.</p>
        </aside>
      </div>

      <div className="metric-row">
        <Metric icon={<FileQuestion />} label="Создано квизов" value={quizzes.length} />
        <Metric icon={<UsersRound />} label="Запусков комнат" value={stats.hosted} />
        <Metric icon={<BarChart3 />} label="Всего вопросов" value={stats.questions} />
        <Metric icon={<Trophy />} label="Лучший результат" value={stats.bestScore} />
      </div>

      <section className="panel content-stack">
        <div className="page-header">
          <div>
            <p className="eyebrow">Последние активности</p>
            <h2>Ваши игры и комнаты</h2>
          </div>
          <Link className="secondary-button compact" to="/history">
            <History size={16} />
            История игр
          </Link>
        </div>
        {[...history.participations, ...history.organizedRooms].slice(0, 5).map((item) => {
          const room = item.room || item;
          return (
            <article className="activity-row" key={item.id}>
              <FileQuestion size={24} />
              <strong>{room.quiz?.title || "Квиз"}</strong>
              <span>{item.score !== undefined ? `${item.score} баллов` : room.status}</span>
            </article>
          );
        })}
        {history.participations.length === 0 && history.organizedRooms.length === 0 ? (
          <p className="screen-state">Пока нет активности. Создайте квиз или подключитесь к комнате.</p>
        ) : null}
      </section>
    </section>
  );
}

function Metric({ icon, label, value }) {
  return (
    <article className="metric-card">
      <span>{icon}</span>
      <strong>{value}</strong>
      <p>{label}</p>
    </article>
  );
}
