import userIcon from "../../assets/Gathering_participants/user.svg";
import { getParticipantAvatarStyle, getParticipantName } from "./participant-utils";

function getJoinedTime(participant) {
  if (!participant.joinedAt) {
    return "--:--";
  }

  return new Date(participant.joinedAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ParticipantList({ participants, className = "" }) {
  const isFullList = participants.length >= 6;

  return (
    <div className={`gathering-participants-card ${isFullList ? "is-full" : "is-compact"} ${className}`}>
      <div className="gathering-participants-scroll">
        {participants.map((participant, index) => (
          <article className="gathering-participant-row" key={participant.id}>
            <div className="gathering-participant-name">
              <span className="gathering-avatar" style={getParticipantAvatarStyle(participant, index)}>
                <img src={userIcon} alt="" />
              </span>
              <strong>{getParticipantName(participant)}</strong>
            </div>
            <div className="gathering-participant-status">
              <span />
              <em>Подключен</em>
            </div>
            <time>{getJoinedTime(participant)}</time>
          </article>
        ))}
      </div>
    </div>
  );
}
