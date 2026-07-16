import { resolveUploadUrl } from "../utils/uploads";
import { getProfileTheme } from "../utils/profile-theme";

export function UserAvatar({
  className = "",
  fallbackIndex = 0,
  name = "",
  user = null,
}) {
  const theme = getProfileTheme(user?.profileColor, fallbackIndex);
  const avatarUrl = resolveUploadUrl(user?.avatarUrl);
  const displayName = user?.name || name || "QuizRoom";
  const initial = displayName.trim().charAt(0).toUpperCase() || "Q";

  return (
    <span
      className={`user-avatar${className ? ` ${className}` : ""}`}
      style={{
        "--user-avatar-bg": theme.background,
        "--user-avatar-border": theme.border,
        "--user-avatar-color": theme.foreground,
        backgroundColor: theme.background,
        borderColor: theme.border,
        color: theme.foreground,
      }}
      aria-hidden="true"
    >
      {avatarUrl ? (
        <img className="user-avatar-photo" src={avatarUrl} alt="" />
      ) : (
        <span className="user-avatar-initial">{initial}</span>
      )}
    </span>
  );
}
