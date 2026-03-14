import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout.jsx";
import ProtectedRoute from "./components/routing/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import DocumentsPage from "./pages/DocumentsPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import SchemesPage from "./pages/SchemesPage.jsx";

const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

const CatchAllRoute = () => {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />;
};

const App = () => (
  <Routes>
    <Route
      path="/"
      element={
        <PublicOnlyRoute>
          <HomePage />
        </PublicOnlyRoute>
      }
    />
    <Route
      path="/login"
      element={
        <PublicOnlyRoute>
          <LoginPage />
        </PublicOnlyRoute>
      }
    />
    <Route
      path="/register"
      element={
        <PublicOnlyRoute>
          <RegisterPage />
        </PublicOnlyRoute>
      }
    />

    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/schemes" element={<SchemesPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<CatchAllRoute />} />
  </Routes>
);

export default App;
