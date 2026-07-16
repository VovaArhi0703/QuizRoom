export function formatOverviewDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

export function formatPlace(place) {
  return Number.isFinite(place) && place > 0 ? `${place} место` : "—";
}
