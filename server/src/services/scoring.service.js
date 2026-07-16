function normalizeIds(ids) {
  return [...new Set(ids || [])].map(String).sort();
}

function areSameSet(left, right) {
  const a = normalizeIds(left);
  const b = normalizeIds(right);

  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function calculateAnswerScore(question, selectedOptionIds, answeredAt = new Date()) {
  const correctOptionIds = question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.id);
  const isCorrect = areSameSet(correctOptionIds, selectedOptionIds);

  if (!isCorrect) {
    return { isCorrect: false, points: 0 };
  }

  const startedAt = question.startedAt ? new Date(question.startedAt) : null;
  const elapsedSeconds = startedAt
    ? Math.max(0, Math.floor((answeredAt.getTime() - startedAt.getTime()) / 1000))
    : 0;
  const timeLimit = Math.max(1, Number(question.timeLimit) || 1);
  const remainingSeconds = Math.max(0, timeLimit - elapsedSeconds);
  const speedBonus = Math.round((remainingSeconds / timeLimit) * 15);

  return {
    isCorrect: true,
    points: 100 + Math.min(15, speedBonus),
  };
}

module.exports = { calculateAnswerScore };
