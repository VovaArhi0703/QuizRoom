import { getProfileTheme } from "../../utils/profile-theme";

export function getParticipantTheme(participant, index = 0) {
  return getProfileTheme(participant?.user?.profileColor, index);
}

export function getParticipantName(participant) {
  return participant.user?.name || participant.guestName || "Участник";
}

export function getParticipantsLabel(count) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} Участников`;
  }

  if (last === 1) {
    return `${count} Участник`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} Участника`;
  }

  return `${count} Участников`;
}

export function getParticipantAvatarStyle(participant, index = 0) {
  const theme = getParticipantTheme(participant, index);

  return {
    "--user-avatar-bg": theme.background,
    "--user-avatar-border": theme.border,
    "--user-avatar-color": theme.foreground,
  };
}

export function translateRealtimeError(message, fallback = "Не удалось выполнить действие") {
  const translations = {
    "Room was not found": "Комната с таким кодом не найдена",
    "Room is already finished": "Этот квиз уже завершён",
    "Room is not active": "Квиз сейчас не активен",
    "Answer time is over": "Время ответа закончилось",
    "This question is not active": "Этот вопрос уже завершён",
    "Join room before submitting answers": "Сначала подключитесь к комнате",
    "Quiz has no questions": "В квизе нет вопросов",
    "Quiz has already started": "Этот квиз уже запущен",
    "At least one participant is required": "Для запуска нужен хотя бы один участник",
    "Only room host can open this room": "Открыть эту комнату может только организатор",
    "Only room host can start quiz": "Запустить квиз может только организатор",
    "Only room host can close this room": "Закрыть комнату может только организатор",
  };

  return translations[message] || message || fallback;
}
