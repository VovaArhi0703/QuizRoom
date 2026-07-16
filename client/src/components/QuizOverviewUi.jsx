import { parseQuizTags, quizThemes } from "../utils/quiz-tags";

import historyQuizBlue from "../assets/history_quiz_screen/quiz_big_blue.svg";
import historyQuizGreen from "../assets/history_quiz_screen/quiz_big_green.svg";
import historyQuizOrange from "../assets/history_quiz_screen/quiz_big_orange.svg";
import historyQuizPurple from "../assets/history_quiz_screen/quiz_big_purple.svg";
import historyQuizRed from "../assets/history_quiz_screen/quiz_big_red.svg";
import createdQuizBlue from "../assets/created_quizzes_screen/quiz_big_blue.svg";
import createdQuizGreen from "../assets/created_quizzes_screen/quiz_big_green.svg";
import createdQuizOrange from "../assets/created_quizzes_screen/quiz_big_orange.svg";
import createdQuizPurple from "../assets/created_quizzes_screen/quiz_big_purple.svg";
import createdQuizRed from "../assets/created_quizzes_screen/quiz_big_red.svg";
import miniQuizBlue from "../assets/main_screen/quiz_mini_blue.svg";
import miniQuizGreen from "../assets/main_screen/quiz_mini_green.svg";
import miniQuizOrange from "../assets/main_screen/quiz_mini_orange.svg";
import miniQuizPurple from "../assets/main_screen/quiz_mini_purple.svg";
import miniQuizRed from "../assets/main_screen/quiz_mini_red.svg";

const bigQuizIcons = {
  history: {
    blue: historyQuizBlue,
    green: historyQuizGreen,
    orange: historyQuizOrange,
    purple: historyQuizPurple,
    red: historyQuizRed,
  },
  created: {
    blue: createdQuizBlue,
    green: createdQuizGreen,
    orange: createdQuizOrange,
    purple: createdQuizPurple,
    red: createdQuizRed,
  },
};

const miniQuizIcons = {
  blue: miniQuizBlue,
  green: miniQuizGreen,
  orange: miniQuizOrange,
  purple: miniQuizPurple,
  red: miniQuizRed,
};

function getCategoryPresentation(category) {
  const tags = parseQuizTags(category);
  const theme = quizThemes[tags[0]?.color] || quizThemes.purple;
  return { tags, theme };
}

export function QuizTagList({ category, limit }) {
  const parsedTags = parseQuizTags(category);
  const tags = Number.isFinite(limit) ? parsedTags.slice(0, limit) : parsedTags;

  if (!tags.length) {
    return <span className="overview-tag is-neutral">Без категории</span>;
  }

  return tags.map((tag, index) => {
    const theme = quizThemes[tag.color] || quizThemes.purple;
    return (
      <span
        className="overview-tag"
        key={`${tag.label}-${index}`}
        style={{ "--tag-bg": theme.background, "--tag-color": theme.foreground }}
        title={tag.label}
      >
        {tag.label}
      </span>
    );
  });
}

export function QuizThemeIcon({ category, size = "big", source = "history" }) {
  const { theme } = getCategoryPresentation(category);
  const icons = size === "mini" ? miniQuizIcons : bigQuizIcons[source] || bigQuizIcons.history;

  return (
    <span
      className={`overview-quiz-icon is-${size}`}
      style={{ "--quiz-bg": theme.background, "--quiz-border": theme.border }}
    >
      <img src={icons[theme.id] || icons.purple} alt="" />
    </span>
  );
}

export function OverviewStatsPanel({ title, description, icon, items }) {
  return (
    <section className="overview-stats-panel">
      <header className="overview-section-heading">
        <span className="overview-heading-icon"><img src={icon} alt="" /></span>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
      </header>
      <div className="overview-stat-grid">
        {items.map((item) => (
          <article className="overview-stat-card" key={item.label}>
            <img src={item.icon} alt="" />
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export function OverviewEmptyState({ title, text, action }) {
  return (
    <div className="overview-empty-state">
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action || null}
    </div>
  );
}

export function OverviewLoading({ cards = 3 }) {
  return (
    <div className="overview-card-grid" aria-label="Загрузка">
      {Array.from({ length: cards }, (_, index) => (
        <div className="overview-card overview-card-skeleton" key={index} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
