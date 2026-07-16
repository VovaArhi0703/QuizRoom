import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCached } from "../api/queryCache";
import {
  OverviewEmptyState,
  OverviewLoading,
  OverviewStatsPanel,
  QuizTagList,
  QuizThemeIcon,
} from "../components/QuizOverviewUi";
import { formatOverviewDate } from "../utils/overview-format";
import activityIcon from "../assets/history_quiz_screen/arrow_up.svg";
import quizStatIcon from "../assets/history_quiz_screen/quiz.svg";
import speedIcon from "../assets/history_quiz_screen/speedometer.svg";
import questionIcon from "../assets/history_quiz_screen/question.svg";
import questionMetaIcon from "../assets/history_quiz_screen/question_statistic.svg";
import dateIcon from "../assets/history_quiz_screen/date.svg";
import winIcon from "../assets/history_quiz_screen/win_mini.svg";
import starIcon from "../assets/history_quiz_screen/star.svg";
import leaderboardIcon from "../assets/history_quiz_screen/back_arrow.svg";
import historyImage from "../assets/history_quiz_screen/history_image.png";

const emptyStats = { quizzesCompleted: 0, averageAccuracy: 0, totalQuestionsAnswered: 0, topOneCount: 0 };

export function HistoryPage() {
  const [history, setHistory] = useState({ participations: [], participantStats: emptyStats });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCached("/profile/history")
      .then((data) => { if (active) setHistory(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const stats = { ...emptyStats, ...history.participantStats };
  const statItems = [
    { icon: quizStatIcon, value: stats.quizzesCompleted, label: "Пройдено квизов" },
    { icon: speedIcon, value: `${stats.averageAccuracy}%`, label: "Средний результат" },
    { icon: questionIcon, value: stats.totalQuestionsAnswered, label: "Всего вопросов" },
    { icon: winIcon, value: stats.topOneCount, label: "Занял топ 1" },
  ];

  return (
    <section className="overview-screen overview-list-screen">
      <div className="overview-hero-row">
        <OverviewStatsPanel
          title="Общая активность"
          description="Здесь находится общая активность по пройденным квизам"
          icon={activityIcon}
          items={statItems}
        />
        <aside className="overview-action-banner history-action-banner">
          <img src={historyImage} alt="" />
          <div>
            <h1>Присоединись к комнате</h1>
            <p>Присоединяйся, отвечай на вопросы и борись за лидерство</p>
            <Link to="/join">Присоединиться</Link>
          </div>
        </aside>
      </div>

      {error ? <p className="overview-error" role="alert">{error}</p> : null}
      {isLoading ? <OverviewLoading /> : null}
      {!isLoading && history.participations?.length ? (
        <div className="overview-card-grid">
          {history.participations.map((participation) => (
            <article className="overview-card history-overview-card" key={participation.id}>
              <div className="overview-card-heading">
                <QuizThemeIcon category={participation.room.quiz.category} source="history" />
                <div>
                  <h2>{participation.room.quiz.title}</h2>
                  <div className="overview-tags"><QuizTagList category={participation.room.quiz.category} /></div>
                </div>
              </div>
              <div className="overview-card-lower">
                <div className="overview-card-meta">
                  <span><img src={questionMetaIcon} alt="" />{participation.questionCount} вопросов</span>
                  <span><img src={dateIcon} alt="" />Пройден {formatOverviewDate(participation.completedAt)}</span>
                  <span><img src={starIcon} alt="" />{participation.score} баллов</span>
                </div>
                <Link className="overview-card-primary" to={`/results/${participation.room.code}`}>
                  <img src={leaderboardIcon} alt="" />
                  Посмотреть лидерборд
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {!isLoading && !history.participations?.length ? (
        <OverviewEmptyState
          title="История игр пока пуста"
          text="Здесь появятся карточки завершённых квизов и ссылки на их лидерборды."
          action={<Link className="overview-primary-action" to="/join">Подключиться к комнате</Link>}
        />
      ) : null}
    </section>
  );
}
