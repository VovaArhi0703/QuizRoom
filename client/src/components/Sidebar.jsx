import { Link, NavLink } from "react-router-dom";
import logoSidebar from "../assets/sidebar/logo_sidebar.svg";
import homeSidebarOff from "../assets/sidebar/home_sidebar_off.svg";
import homeSidebarOn from "../assets/sidebar/home_sidebar_on.svg";
import userSidebarOff from "../assets/sidebar/user_sidebar_off.svg";
import userSidebarOn from "../assets/sidebar/user_sidebar_on.svg";
import historySidebarOff from "../assets/sidebar/history_sidebar_off.svg";
import historySidebarOn from "../assets/sidebar/history_sidebar_on.svg";
import createQuizSidebarOff from "../assets/sidebar/create_quiz_sidebar_off.svg";
import createQuizSidebarOn from "../assets/sidebar/create_quiz_sidebar_on.svg";
import connectRoomSidebar from "../assets/sidebar/connect_room_sidebar.svg";

const navItems = [
  { to: "/dashboard", label: "Главная", iconOff: homeSidebarOff, iconOn: homeSidebarOn },
  { to: "/profile", label: "Профиль", iconOff: userSidebarOff, iconOn: userSidebarOn },
  { to: "/history", label: "История игр", iconOff: historySidebarOff, iconOn: historySidebarOn },
  { to: "/quizzes", label: "Созданные квизы", iconOff: createQuizSidebarOff, iconOn: createQuizSidebarOn },
];

export function Sidebar() {
  return (
    <aside className="qr-sidebar">
      <div className="qr-sidebar-top">
        <Link className="qr-sidebar-logo" to="/dashboard" aria-label="QuizRoom">
          <img src={logoSidebar} alt="" />
          <span>QuizRoom</span>
        </Link>

        <nav className="qr-sidebar-nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <NavLink className="qr-sidebar-link" key={item.to} to={item.to}>
              {({ isActive }) => (
                <>
                  <img className="qr-sidebar-icon" src={isActive ? item.iconOn : item.iconOff} alt="" />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <Link className="qr-join-card" to="/join" aria-label="Подключиться к комнате">
        <img src={connectRoomSidebar} alt="" />
      </Link>
    </aside>
  );
}
