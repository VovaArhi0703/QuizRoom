const profileThemes = {
  green: {
    background: "#F1F9C6",
    border: "rgba(40, 171, 60, 0.2)",
    foreground: "#28AB3C",
  },
  violet: {
    background: "#E3E0FD",
    border: "rgba(88, 73, 225, 0.2)",
    foreground: "#5849E1",
  },
  blue: {
    background: "#E7F0FB",
    border: "rgba(60, 138, 255, 0.2)",
    foreground: "#3C8AFF",
  },
  yellow: {
    background: "#FCF0D3",
    border: "rgba(244, 153, 7, 0.2)",
    foreground: "#F49907",
  },
  red: {
    background: "#EBCECD",
    border: "rgba(189, 66, 67, 0.2)",
    foreground: "#BD4243",
  },
};

const fallbackThemeIds = ["violet", "yellow", "green", "blue", "red"];

export function getProfileTheme(profileColor, fallbackIndex = 0) {
  if (profileThemes[profileColor]) {
    return profileThemes[profileColor];
  }

  const safeIndex = Math.max(0, Number(fallbackIndex) || 0) % fallbackThemeIds.length;
  return profileThemes[fallbackThemeIds[safeIndex]];
}
