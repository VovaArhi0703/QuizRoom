import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, FileQuestion, MoreHorizontal, Play, Plus, Trash2 } from "lucide-react";
import { http } from "../api/http";
import { getCached, invalidateCached } from "../api/queryCache";

export function CreatedQuizzesPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadQuizzes(isActive = () => true, force = false) {
    try {
      const data = await getCached("/quizzes", { force });

      if (!isActive()) {
        return;
      }

      setQuizzes(data.quizzes);
    } catch (requestError) {
      if (isActive()) {
        setError(requestError.message);
      }
    } finally {
      if (isActive()) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    let active = true;
    loadQuizzes(() => active);

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(
    () => ({
      total: quizzes.length,
      active: quizzes.filter((quiz) => quiz.status === "PUBLISHED").length,
      questions: quizzes.reduce((sum, quiz) => sum + (quiz._count?.questions || 0), 0),
      launches: quizzes.reduce((sum, quiz) => sum + (quiz._count?.rooms || 0), 0),
    }),
    [quizzes],
  );

  async function createRoom(quizId) {
    try {
      const { data } = await http.post("/rooms", { quizId });
      invalidateCached("/quizzes");
      invalidateCached("/profile/history");
      navigate(`/host/${data.room.code}`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteQuiz(quizId) {
    try {
      await http.delete(`/quizzes/${quizId}`);
      invalidateCached("/quizzes");
      invalidateCached("/profile/history");
      setQuizzes((current) => current.filter((quiz) => quiz.id !== quizId));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section className="content-stack">
      <div className="dashboard-grid">
        <article className="panel content-stack">
          <div className="section-title">
            <FileQuestion size={28} />
            <div>
              <h2>Общая активность</h2>
              <p className="muted">Управляйте своими квизами и отслеживайте активность</p>
            </div>
          </div>
          <div className="metric-row compact-metrics">
            <Metric label="Всего квизов" value={stats.total} />
            <Metric label="Активных" value={stats.active} />
            <Metric label="Всего вопросов" value={stats.questions} />
            <Metric label="Запусков" value={stats.launches} />
          </div>
        </article>

        <aside className="panel dark-callout wide-action">
          <h2>Создать новый квиз</h2>
          <p>Соберите вопросы, настройте правила и запустите игру</p>
          <Link className="primary-button" to="/quizzes/new">
            <Plus size={18} />
            Создать квиз
          </Link>
        </aside>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading ? <p className="screen-state">Загружаем квизы...</p> : null}

      <div className="quiz-card-grid">
        {quizzes.map((quiz) => (
          <article className="quiz-card" key={quiz.id}>
            <div className="quiz-card-icon">
              <FileQuestion size={34} />
            </div>
            <div className="quiz-card-main">
              <h2>{quiz.title}</h2>
              <div className="tag-row">
                {(quiz.category || "Без категории")
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
              </div>
              <p className="quiz-meta">
                <span>{quiz._count?.questions || 0} вопросов</span>
                <span>
                  <Calendar size={16} />
                  Обновлен {new Date(quiz.updatedAt).toLocaleDateString("ru-RU")}
                </span>
                <span>Запусков: {quiz._count?.rooms || 0}</span>
              </p>
            </div>
            <div className="quiz-actions">
              <Link className="secondary-button compact" to={`/quizzes/${quiz.id}/edit`}>
                Редактировать
              </Link>
              <button className="primary-button compact" type="button" onClick={() => createRoom(quiz.id)}>
                <Play size={16} />
                Запустить
              </button>
              <button className="icon-button" type="button" onClick={() => deleteQuiz(quiz.id)} title="Удалить">
                <Trash2 size={17} />
              </button>
              <button className="icon-button" type="button" title="Еще">
                <MoreHorizontal size={18} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <article className="mini-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
