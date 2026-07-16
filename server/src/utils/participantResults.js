function getEarnedScore(participant) {
  if (Array.isArray(participant?.answers)) {
    return participant.answers.reduce(
      (total, answer) => total + Math.max(0, Number(answer?.points) || 0),
      0,
    );
  }

  return Math.max(0, Number(participant?.score) || 0);
}

function normalizeParticipantScore(participant) {
  return {
    ...participant,
    score: getEarnedScore(participant),
  };
}

function getParticipantKey(participant) {
  return participant.userId
    ? `user:${participant.userId}`
    : `guest:${participant.id}`;
}

function dedupeParticipants(participants = []) {
  const uniqueParticipants = new Map();

  for (const rawParticipant of participants) {
    const participant = normalizeParticipantScore(rawParticipant);
    const key = getParticipantKey(participant);
    const existing = uniqueParticipants.get(key);
    const shouldReplace =
      !existing ||
      participant.score > existing.score ||
      (
        participant.score === existing.score &&
        new Date(participant.joinedAt) < new Date(existing.joinedAt)
      );

    if (shouldReplace) {
      uniqueParticipants.set(key, participant);
    }
  }

  return [...uniqueParticipants.values()];
}

function sortLeaderboard(participants = []) {
  return [...participants].sort(
    (left, right) =>
      right.score - left.score ||
      new Date(left.joinedAt) - new Date(right.joinedAt),
  );
}

function countUniqueParticipants(participants = []) {
  return new Set(participants.map(getParticipantKey)).size;
}

module.exports = {
  countUniqueParticipants,
  dedupeParticipants,
  getEarnedScore,
  normalizeParticipantScore,
  sortLeaderboard,
};
