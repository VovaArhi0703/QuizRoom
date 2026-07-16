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
  {
    to: "/dashboard",
    label: "\u0413\u043b\u0430\u0432\u043d\u0430\u044f",
    iconOff: homeSidebarOff,
    iconOn: homeSidebarOn,
  },
  {
    to: "/profile",
    label: "\u041f\u0440\u043e\u0444\u0438\u043b\u044c",
    iconOff: userSidebarOff,
    iconOn: userSidebarOn,
  },
  {
    to: "/history",
    label: "\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438\u0433\u0440",
    iconOff: historySidebarOff,
    iconOn: historySidebarOn,
  },
  {
    to: "/quizzes",
    label: "\u0421\u043e\u0437\u0434\u0430\u043d\u043d\u044b\u0435 \u043a\u0432\u0438\u0437\u044b",
    iconOff: createQuizSidebarOff,
    iconOn: createQuizSidebarOn,
  },
];

export function Sidebar({ isOpen = false, onClose = () => {} }) {
  return (
    <>
      <button
        className={`qr-sidebar-backdrop${isOpen ? " is-open" : ""}`}
        type="button"
        aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c \u043c\u0435\u043d\u044e"
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
      />

      <aside
        className={`qr-sidebar${isOpen ? " is-open" : ""}`}
        id="quizroom-sidebar"
      >
        <div className="qr-sidebar-top">
          <Link
            className="qr-sidebar-logo"
            to="/dashboard"
            aria-label="QuizRoom"
            onClick={onClose}
          >
            <img src={logoSidebar} alt="" />
            <span>QuizRoom</span>
          </Link>

          <nav
            className="qr-sidebar-nav"
            aria-label="\u041e\u0441\u043d\u043e\u0432\u043d\u0430\u044f \u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f"
          >
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `qr-sidebar-link${isActive ? " active" : ""}`
                }
                key={item.to}
                to={item.to}
                onClick={onClose}
              >
                {({ isActive }) => (
                  <>
                    <img
                      className="qr-sidebar-icon"
                      src={isActive ? item.iconOn : item.iconOff}
                      alt=""
                    />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <Link
          className="qr-join-card"
          to="/join"
          aria-label="\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u043a \u043a\u043e\u043c\u043d\u0430\u0442\u0435"
          onClick={onClose}
        >
          <img src={connectRoomSidebar} alt="" />
        </Link>
      </aside>
    </>
  );
}
