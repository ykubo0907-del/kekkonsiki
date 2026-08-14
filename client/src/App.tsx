import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import HostRoomPage from "./pages/HostRoomPage";
import JoinPage from "./pages/JoinPage";
import LoginPage from "./pages/LoginPage";
import PreviewPage from "./pages/PreviewPage";
import QuizEditPage from "./pages/QuizEditPage";
import QuizListPage from "./pages/QuizListPage";
import ScreenPage from "./pages/ScreenPage";

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { username, loading } = useAuth();
  if (loading) return <div className="page">読み込み中...</div>;
  if (!username) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <QuizListPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/quizzes/:id"
          element={
            <RequireAdmin>
              <QuizEditPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/quizzes/:id/preview"
          element={
            <RequireAdmin>
              <PreviewPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/room/:code"
          element={
            <RequireAdmin>
              <HostRoomPage />
            </RequireAdmin>
          }
        />
        <Route path="/play/:code" element={<JoinPage />} />
        <Route path="/screen/:code" element={<ScreenPage />} />
      </Routes>
    </AuthProvider>
  );
}
