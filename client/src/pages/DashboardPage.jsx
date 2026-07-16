import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCached } from "../api/queryCache";
import { useAuth } from "../features/auth/auth-context";
import { getDisplayId } from "../utils/display-id";
import { OverviewEmptyState, QuizThemeIcon } from "../components/QuizOverviewUi";
import { UserAvatar } from "../components/UserAvatar";
import { formatPlace } from "../utils/overview-format";
import { getQuizTheme } from "../utils/quiz-tags";
import quizIcon from "../assets/main_screen/quiz.svg";
import questionIcon from "../assets/main_screen/question.svg";
import winIcon from "../assets/main_screen/win.svg";
import editIcon from "../assets/main_screen/redecorate_main.svg";
import adviceImage from "../assets/main_screen/main_image.png";

const emptyStats = {
  quizzesCompleted: 0,
  averageAccuracy: 0,
  totalQuestionsAnswered: 0,
  topOneCount: 0,
};

export function DashboardPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState({ participations: [], participantStats: emptyStats });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCached("/profile/history")
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const stats = { ...emptyStats, ...history.participantStats };
  const recentParticipations = (history.participations || []).slice(0, 5);
  return (
    <section className="overview-screen dashboard-overview">
      {error ? <p className="overview-error" role="alert">{error}</p> : null}

      <div className="dashboard-overview-top">
        <section className="dashboard-profile-card">
          <div className="dashboard-profile-main">
            <div className="dashboard-identity">
              <UserAvatar className="dashboard-avatar" user={user} />
              <div className="dashboard-name-block">
                <h1>{user?.name}</h1>
                <p>ID:{getDisplayId(user?.id)}</p>
                <Link to="/profile" className="dashboard-edit-button">
                  <img src={editIcon} alt="" />
                  Редактировать профиль
                </Link>
              </div>
            </div>
            <div className="dashboard-mini-stats">
              <DashboardMiniStat tone="purple" icon={quizIcon} value={stats.quizzesCompleted} label="Квизов" />
              <DashboardMiniStat tone="blue" icon={questionIcon} value={stats.totalQuestionsAnswered} label="Всего вопросов" />
              <DashboardMiniStat tone="orange" icon={winIcon} value="Топ-1" label="Топ-1" detail={`${stats.topOneCount} раз`} />
            </div>
          </div>

          <div className="dashboard-average" style={{ "--progress": `${stats.averageAccuracy * 3.6}deg` }}>
            <div>
              <strong>{stats.averageAccuracy}%</strong>
              <span>Средний результат</span>
            </div>
          </div>
        </section>

        <aside className="dashboard-advice">
          <span className="dashboard-advice-pill">Совет QuizRoom</span>
          <h2>Как подняться в лидерборде?</h2>
          <div>
            <p>Отвечайте не только правильно, но и быстрее. При равном количестве верных ответов время ответа влияет на итоговое место в квизе.</p>
            <img src={adviceImage} alt="" />
          </div>
        </aside>
      </div>

      <section
        className={`dashboard-activity-panel${
          !isLoading && !recentParticipations.length ? " is-empty" : ""
        }`}
      >
        <h2>Последние активности</h2>
        <div
          className={`dashboard-activity-list${
            !isLoading && !recentParticipations.length ? " is-empty" : ""
          }${isLoading ? " is-loading" : ""}`}
        >
          {recentParticipations.map((participation) => {
            const theme = getQuizTheme(participation.room.quiz.category);
            return (
              <Link className="dashboard-activity-row" key={participation.id} to={`/results/${participation.room.code}`}>
                <div className="dashboard-activity-title">
                  <QuizThemeIcon category={participation.room.quiz.category} size="mini" />
                  <strong>{participation.room.quiz.title}</strong>
                </div>
                <span className="dashboard-activity-place">{formatPlace(participation.place)}</span>
                <div className="dashboard-accuracy">
                  <span><strong>{participation.accuracy}%</strong> Правильных ответов</span>
                  <i><b style={{ width: `${participation.accuracy}%` }} /></i>
                </div>
                <span
                  className="dashboard-score"
                  style={{ "--score-bg": theme.background, "--score-border": theme.border }}
                >
                  <small>Баллов</small><strong>{participation.score}</strong>
                </span>
              </Link>
            );
          })}
          {!isLoading && !recentParticipations.length ? (
            <OverviewEmptyState
              title="После первого квиза тут появится активность"
              text="Подключитесь к комнате по коду и пройдите квиз."
              action={<Link className="overview-primary-action" to="/join">Подключиться</Link>}
            />
          ) : null}
          {isLoading ? <div className="dashboard-activity-loading" aria-label="Загрузка активности" /> : null}
        </div>
      </section>
    </section>
  );
}

function DashboardMiniStat({ tone, icon, value, label, detail }) {
  return (
    <article className={`dashboard-mini-stat is-${tone}`}>
      <img src={icon} alt="" />
      <span><strong>{value}</strong><small>{detail || label}</small></span>
    </article>
  );
}
