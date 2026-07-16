import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/auth-context";
import { getDisplayId } from "../utils/display-id";
import { Sidebar } from "./Sidebar";
import { UserAvatar } from "./UserAvatar";

export function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    document.body.classList.add("mobile-nav-open");
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.classList.remove("mobile-nav-open");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="app-shell">
      <Sidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      <div className="workspace">
        <header className="workspace-header">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="Открыть меню"
            aria-expanded={isMobileMenuOpen}
            aria-controls="quizroom-sidebar"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu aria-hidden="true" />
          </button>
          <Link className="workspace-title" to="/dashboard">
            QuizRoom
          </Link>
          <div className="user-chip">
            <span>
              {user?.name}
              <small>ID:{getDisplayId(user?.id)}</small>
            </span>
            <UserAvatar className="header-avatar" user={user} />
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
