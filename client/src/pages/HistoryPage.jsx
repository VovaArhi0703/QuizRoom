import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, FileQuestion, Trophy } from "lucide-react";
import { getCached } from "../api/queryCache";

export function HistoryPage() {
  const [history, setHistory] = useState({ organizedRooms: [], participations: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadHistory() {
      try {
        const data = await getCached("/profile/history");

        if (!isActive) {
          return;
        }

        setHistory(data);
      } catch (requestError) {
        if (isActive) {
          setError(requestError.message);
        }
      }
    }

    loadHistory();

    return () => {
      isActive = false;
    };
  }, []);

  const stats = useMemo(() => {
    const played = history.participations.length;
    const hosted = history.organizedRooms.length;
    const bestScore = history.participations.reduce((max, item) => Math.max(max, item.score), 0);
    return { played, hosted, bestScore };
  }, [history]);

  return (
    <section className="content-stack">
      <div className="dashboard-grid">
        <article className="panel content-stack">
          <div className="section-title">
            <BarChart3 size={28} />
            <div>
              <h2>Общая активность</h2>
              <p className="muted">Здесь находится история по пройденным и проведенным квизам</p>
            </div>
          </div>
          <div className="metric-row compact-metrics">
            <Metric label="Пройдено квизов" value={stats.played} />
            <Metric label="Проведено комнат" value={stats.hosted} />
            <Metric label="Лучший балл" value={stats.bestScore} />
          </div>
        </article>
        <aside className="panel dark-callout wide-action">
          <h2>Присоединитесь к комнате</h2>
          <p>Отвечайте на вопросы и боритесь за лидерство</p>
          <Link className="primary-button" to="/join">
            Присоединиться
          </Link>
        </aside>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="quiz-card-grid">
        {history.participations.map((item) => (
          <article className="quiz-card" key={item.id}>
            <div className="quiz-card-icon">
              <FileQuestion size={34} />
            </div>
            <div className="quiz-card-main">
              <h2>{item.room.quiz.title}</h2>
              <p className="quiz-meta">
                <span>Пройден {new Date(item.joinedAt).toLocaleDateString("ru-RU")}</span>
                <span>{item.score} баллов</span>
              </p>
            </div>
            <Link className="primary-button compact" to={`/results/${item.room.code}`}>
              <Trophy size={16} />
              Посмотреть лидерборд
            </Link>
          </article>
        ))}
        {history.participations.length === 0 ? (
          <p className="screen-state">Вы еще не проходили квизы.</p>
        ) : null}
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
