import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { http } from "../api/http";
import {
  getParticipantAvatarStyle,
  getParticipantName,
} from "../components/realtime/participant-utils";
import { useAuth } from "../features/auth/auth-context";
import resultIcon from "../assets/liderboard/result_liderboard.svg";
import userBigIcon from "../assets/liderboard/user_big_liderboard.svg";
import userMiniIcon from "../assets/liderboard/user_mini_liderboard.svg";
import resultShape from "../assets/liderboard/Vector_liderboard.svg";

function getAccuracy(participant, totalQuestions = 0) {
  const answers = participant.answers || [];
  const questionsCount = Math.max(totalQuestions, answers.length);

  if (!questionsCount) {
    return 0;
  }

  return Math.round((answers.filter((answer) => answer.isCorrect).length / questionsCount) * 100);
}

export function ResultsPage({ isProfile = false }) {
  const { roomCode } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const response = isProfile
          ? await http.get("/profile/history")
          : await http.get(`/rooms/${roomCode}/results`);

        if (active) {
          setData(response.data);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError.status
              ? requestError.message
              : "Не удалось загрузить результаты. Проверьте подключение и попробуйте снова.",
          );
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [isProfile, roomCode]);

  const leaderboard = data?.room?.participants || [];
  const storedParticipantId = location.state?.participantId || sessionStorage.getItem(`quizroom_participant_${roomCode}`);
  const ownIndex = leaderboard.findIndex(
    (item) => item.id === storedParticipantId || (user?.id && item.userId === user.id),
  );
  const ownParticipant = ownIndex >= 0 ? leaderboard[ownIndex] : null;
  const isHost = data?.room?.hostId === user?.id;
  const totalQuestions = data?.room?.quiz?._count?.questions || 0;

  if (isProfile) {
    return (
      <section className="content-stack">
        <div className="page-header"><h1>История игр</h1></div>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="grid-list">
          {(data?.organizedRooms || []).map((room) => (
            <article className="card" key={room.id}>
              <p className="eyebrow">Организатор · {room.status}</p>
              <h2>{room.quiz.title}</h2>
              <p className="muted">Участников: {room.participants.length}</p>
            </article>
          ))}
          {(data?.participations || []).map((item) => (
            <article className="card" key={item.id}>
              <p className="eyebrow">Участник · {item.room.status}</p>
              <h2>{item.room.quiz.title}</h2>
              <p className="muted">Баллов: {item.score}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="realtime-state-screen">
        <article className="realtime-message-card">
          <h1>Результаты недоступны</h1>
          <p>{error}</p>
          <Link to="/dashboard">На главную</Link>
        </article>
      </section>
    );
  }

  if (!data) {
    return <div className="results-loading">Загружаем результаты...</div>;
  }

  return (
    <section className="results-screen">
      <div className="results-main-column">
        <header className="results-title-card">
          <span><img src={resultIcon} alt="" /></span>
          <div>
            <p>Лидерборд</p>
            <h1>{data.room.quiz.title}</h1>
          </div>
        </header>

        <section className="results-list-card">
          <div className="results-list-scroll">
            {leaderboard.map((participant, index) => {
              const accuracy = getAccuracy(participant, totalQuestions);

              return (
                <article className="results-row" key={participant.id}>
                  <span className="results-avatar" style={getParticipantAvatarStyle(participant, index)}>
                    <img src={userMiniIcon} alt="" />
                  </span>
                  <div className="results-person">
                    <strong>{getParticipantName(participant)}</strong>
                    <span>{index + 1} Место</span>
                  </div>
                  <div className="results-accuracy">
                    <p><strong>{accuracy}%</strong> Правильных ответов</p>
                    <div><span style={{ width: `${accuracy}%` }} /></div>
                  </div>
                  <div className="results-score"><span>Баллов</span><strong>{participant.score}</strong></div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="results-side-column">
        {!isHost ? (
          <section className="my-result-card">
            <div className="my-result-ring" style={{ "--result-progress": `${getAccuracy(ownParticipant || {}, totalQuestions) * 3.6}deg` }}>
              <span>{getAccuracy(ownParticipant || {}, totalQuestions)}%</span>
            </div>
            <div className="my-result-copy">
              <h2>Мой результат</h2>
              <div>
                <span className="my-result-avatar" style={getParticipantAvatarStyle(ownParticipant || {}, ownIndex)}>
                  <img src={userBigIcon} alt="" />
                </span>
                <p><strong>{ownIndex >= 0 ? ownIndex + 1 : "—"}</strong> Место<small>Баллов: {ownParticipant?.score || 0}</small></p>
              </div>
            </div>
          </section>
        ) : null}

        <section className={`results-finished-card ${isHost ? "host-result" : ""}`}>
          <img src={resultShape} alt="" />
          <h2>Квиз завершён</h2>
          <Link to="/dashboard">На главную</Link>
        </section>
      </aside>
    </section>
  );
}
