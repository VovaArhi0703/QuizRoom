import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../features/auth/AuthProvider";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { AppLayout } from "../components/AppLayout";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { AuthCallbackPage } from "../pages/AuthCallbackPage";
import { DashboardPage } from "../pages/DashboardPage";
import { QuizEditorPage } from "../pages/QuizEditorPage";
import { HostRoomPage } from "../pages/HostRoomPage";
import { JoinRoomPage } from "../pages/JoinRoomPage";
import { PlayRoomPage } from "../pages/PlayRoomPage";
import { ResultsPage } from "../pages/ResultsPage";
import { ProfilePage } from "../pages/ProfilePage";
import { CreatedQuizzesPage } from "../pages/CreatedQuizzesPage";
import { HistoryPage } from "../pages/HistoryPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/quizzes" element={<CreatedQuizzesPage />} />
            <Route path="/quizzes/new" element={<QuizEditorPage />} />
            <Route path="/quizzes/:quizId/edit" element={<QuizEditorPage />} />
            <Route path="/host/:roomCode" element={<HostRoomPage />} />
            <Route path="/join" element={<JoinRoomPage />} />
            <Route path="/play/:roomCode" element={<PlayRoomPage />} />
            <Route path="/results/:roomCode" element={<ResultsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
