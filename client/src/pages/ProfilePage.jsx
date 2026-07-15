import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { http } from "../api/http";
import { useAuth } from "../features/auth/auth-context";
import { getDisplayId } from "../utils/display-id";
import { resolveUploadUrl } from "../utils/uploads";
import galkaProfileBlue from "../assets/profile/galka_profile_blue.svg";
import galkaProfileGreen from "../assets/profile/galka_profile_green.svg";
import galkaProfileOrange from "../assets/profile/galka_profile_orange.svg";
import galkaProfilePutple from "../assets/profile/galka_profile_putple.svg";
import galkaProfileRed from "../assets/profile/galka_profile_red.svg";
import mailProfile from "../assets/profile/mail_profile.svg";
import passwordProfile from "../assets/profile/password_profile.svg";
import dateProfile from "../assets/profile/date_profile.svg";
import exitProfile from "../assets/profile/exit_profile.svg";
import eyeProfileOff from "../assets/profile/eye_profile_off.svg";
import eyeProfileOn from "../assets/profile/eye_profile_on.svg";

const profileColors = [
  { id: "green", background: "#F1F9C6", border: "#28AB3C", checkIcon: galkaProfileGreen },
  { id: "violet", background: "#E3E0FD", border: "#5849E1", checkIcon: galkaProfilePutple },
  { id: "blue", background: "#E7F0FB", border: "#3C8AFF", checkIcon: galkaProfileBlue },
  { id: "yellow", background: "#FCF0D3", border: "#F49907", checkIcon: galkaProfileOrange },
  { id: "red", background: "#EBCECD", border: "#BD4243", checkIcon: galkaProfileRed },
];

export function ProfilePage() {
  const { deleteAccount, logout, updateProfile, uploadAvatar, user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const nameMeasureRef = useRef(null);
  const nameMinMeasureRef = useRef(null);
  const [name, setName] = useState(user?.name || "");
  const [nameWidth, setNameWidth] = useState(0);
  const [selectedColor, setSelectedColor] = useState(user?.profileColor || "violet");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setSelectedColor(user?.profileColor || "violet");
    setAvatarUrl(user?.avatarUrl || "");
    setAvatarFile(null);
  }, [user]);

  useLayoutEffect(() => {
    const measuredWidth = nameMeasureRef.current?.offsetWidth || 0;
    const minMeasuredWidth = nameMinMeasureRef.current?.offsetWidth || 0;
    const horizontalPaddingAndBorder = 28;
    const preferredWidth = Math.ceil(measuredWidth) + horizontalPaddingAndBorder;
    const minWidth = Math.ceil(minMeasuredWidth) + horizontalPaddingAndBorder;

    setNameWidth(Math.min(538, Math.max(minWidth, preferredWidth)));
  }, [name]);

  const currentColor = profileColors.find((color) => color.id === selectedColor) || profileColors[1];
  const displayAvatarUrl = resolveUploadUrl(avatarUrl);
  const shortId = getDisplayId(user?.id);
  const nameLength = Math.max(name.trim().length, 1);
  const nameFontSize = Math.max(24, 36 - Math.max(0, nameLength - 26) * 1.2);
  const nameLineHeight = Math.min(43, Math.round(nameFontSize * 1.2));
  const profileNameStyle = {
    "--profile-border": currentColor.border,
    "--profile-name-font-size": `${nameFontSize}px`,
    "--profile-name-line-height": `${nameLineHeight}px`,
    "--profile-name-width": `${nameWidth}px`,
  };
  const createdAt = useMemo(() => {
    if (!user?.createdAt) {
      return "—";
    }

    return new Date(user.createdAt).toLocaleDateString("ru-RU");
  }, [user?.createdAt]);

  const hasChanges =
    name.trim() !== (user?.name || "") ||
    selectedColor !== (user?.profileColor || "violet") ||
    avatarUrl !== (user?.avatarUrl || "") ||
    Boolean(avatarFile);

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Можно загрузить только изображение");
      return;
    }

    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
    setStatus("");
    setError("");
  }

  async function handleSave() {
    setIsSaving(true);
    setStatus("");
    setError("");

    let uploadedAvatarUrl = "";
    let profileWasSaved = false;

    try {
      let nextAvatarUrl = user?.avatarUrl || "";

      if (avatarFile) {
        nextAvatarUrl = await uploadAvatar(avatarFile);
        uploadedAvatarUrl = nextAvatarUrl;
      }

      await updateProfile({
        name: name.trim(),
        profileColor: selectedColor,
        avatarUrl: nextAvatarUrl,
      });
      profileWasSaved = true;
      setAvatarFile(null);
      setAvatarUrl(nextAvatarUrl);
      setStatus("Изменения сохранены");
    } catch (requestError) {
      if (uploadedAvatarUrl && !profileWasSaved) {
        await http.delete("/uploads/image", {
          data: { imageUrl: uploadedAvatarUrl },
        }).catch(() => {});
      }
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm("Удалить аккаунт полностью? Это действие нельзя отменить.");

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      await deleteAccount();
      navigate("/register", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      setIsDeleting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <section className="profile-screen" aria-labelledby="profile-title">
      <article className="profile-card">
        <div className="profile-main-block">
          <div className="profile-identity" style={profileNameStyle}>
            <button
              className="profile-avatar-large"
              style={{ "--profile-border": currentColor.border, "--profile-bg": currentColor.background }}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Загрузить фото профиля"
            >
              {displayAvatarUrl ? (
                <img src={displayAvatarUrl} alt="" />
              ) : (
                <span>{name?.[0]?.toUpperCase() || "Q"}</span>
              )}
              <span className="profile-avatar-overlay" aria-hidden="true">
                <Camera size={34} />
              </span>
            </button>
            <input
              ref={fileInputRef}
              className="profile-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarChange}
            />
            <div className="profile-name-block">
              <span ref={nameMeasureRef} className="profile-name-measure" aria-hidden="true">
                {name}
              </span>
              <span ref={nameMinMeasureRef} className="profile-name-measure" aria-hidden="true">
                00000
              </span>
              <input
                id="profile-title"
                className="profile-name-input"
                value={name}
                maxLength={40}
                onChange={(event) => {
                  setName(event.target.value);
                  setStatus("");
                }}
                aria-label="Имя профиля"
              />
              <p>ID:{shortId}</p>
            </div>
          </div>

          <div className="profile-color-block">
            <h2>Выбор цвета профиля</h2>
            <div className="profile-swatches" role="radiogroup" aria-label="Цвет профиля">
              {profileColors.map((color) => (
                <button
                  className="profile-swatch"
                  key={color.id}
                  style={{ "--swatch-bg": color.background, "--swatch-border": color.border }}
                  type="button"
                  role="radio"
                  aria-checked={selectedColor === color.id}
                  aria-label={`Цвет ${color.id}`}
                  onClick={() => {
                    setSelectedColor(color.id);
                    setStatus("");
                  }}
                >
                  {selectedColor === color.id ? (
                    <img className="profile-swatch-check" src={color.checkIcon} alt="" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        <dl className="profile-data-list">
          <ProfileDataRow icon={mailProfile} label="Email" value={user?.email || "—"} />
          <ProfileDataRow
            icon={passwordProfile}
            label="Password"
            value={isPasswordVisible ? "Google / JWT" : "••••••••••••"}
            action={
              <button
                className="profile-eye-button"
                type="button"
                aria-label={isPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setIsPasswordVisible((value) => !value)}
              >
                <img src={isPasswordVisible ? eyeProfileOn : eyeProfileOff} alt="" />
              </button>
            }
          />
          <ProfileDataRow icon={dateProfile} label="Дата создания" value={createdAt} />
        </dl>

        <div className="profile-footer">
          <div className={hasChanges ? "profile-actions has-save" : "profile-actions"}>
            {hasChanges ? (
              <button className="profile-save-button" type="button" disabled={isSaving} onClick={handleSave}>
                {isSaving ? "Сохраняем..." : "Сохранить изменения"}
              </button>
            ) : null}
            <button className="profile-delete-button" type="button" disabled={isDeleting} onClick={handleDeleteAccount}>
              {isDeleting ? "Удаляем..." : "Удалить аккаунт"}
            </button>
          </div>

          <button className="profile-logout-button" type="button" onClick={handleLogout}>
            <span>Выйти из аккаунта</span>
            <img src={exitProfile} alt="" />
          </button>
        </div>

        {error ? <p className="profile-error">{error}</p> : null}
        {status ? <p className="profile-status">{status}</p> : null}
      </article>
    </section>
  );
}

function ProfileDataRow({ action, icon, label, value }) {
  return (
    <div className="profile-data-row">
      <dt>
        <img src={icon} alt="" />
        <span>{label}</span>
      </dt>
      <dd>
        <span>{value}</span>
        {action}
      </dd>
    </div>
  );
}
