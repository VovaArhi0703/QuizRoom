const CATEGORY_PREFIX = "qr-tags:v1:";

export const quizThemes = {
  green: { id: "green", background: "#F1F9C6", foreground: "#28AB3C", border: "rgba(40, 171, 60, 0.2)" },
  purple: { id: "purple", background: "#E3E0FD", foreground: "#5849E1", border: "rgba(88, 73, 225, 0.2)" },
  blue: { id: "blue", background: "#E7F0FB", foreground: "#3C8AFF", border: "rgba(60, 138, 255, 0.2)" },
  orange: { id: "orange", background: "#FCF0D3", foreground: "#F49907", border: "rgba(244, 153, 7, 0.2)" },
  red: { id: "red", background: "#EBCECD", foreground: "#BD4243", border: "rgba(189, 66, 67, 0.2)" },
};

const themeIds = Object.keys(quizThemes);

function normalizeTag(tag, index) {
  const label = String(typeof tag === "string" ? tag : tag?.label || "").trim();
  const color = themeIds.includes(tag?.color) ? tag.color : themeIds[index % themeIds.length];

  return label ? { label, color } : null;
}

export function parseQuizTags(category) {
  const value = String(category || "").trim();

  if (value.startsWith(CATEGORY_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(CATEGORY_PREFIX.length));
      return (Array.isArray(parsed) ? parsed : []).map(normalizeTag).filter(Boolean);
    } catch {
      // Older or partially saved values fall back to the plain category parser below.
    }
  }

  return value
    .split(",")
    .map((label, index) => normalizeTag({ label, color: themeIds[index % themeIds.length] }, index))
    .filter(Boolean);
}

export function serializeQuizTags(tags) {
  const normalized = (Array.isArray(tags) ? tags : []).map(normalizeTag).filter(Boolean);
  return normalized.length ? `${CATEGORY_PREFIX}${JSON.stringify(normalized)}` : "";
}

export function getQuizTheme(category) {
  const firstTag = parseQuizTags(category)[0];
  return quizThemes[firstTag?.color] || quizThemes.purple;
}
