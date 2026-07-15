import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/auth-context";
import { getDisplayId } from "../utils/display-id";
import { resolveUploadUrl } from "../utils/uploads";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const { user } = useAuth();
  const avatarUrl = resolveUploadUrl(user?.avatarUrl);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="workspace">
        <header className="workspace-header">
          <Link className="workspace-title" to="/dashboard">
            QuizRoom
          </Link>
          <div className="user-chip">
            <span>
              {user?.name}
              <small>ID:{getDisplayId(user?.id)}</small>
            </span>
            <div className="header-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : user?.name?.[0]?.toUpperCase() || "Q"}
            </div>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
