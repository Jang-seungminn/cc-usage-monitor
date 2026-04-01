import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import PersonalDashboard from "./pages/PersonalDashboard";
import Settings from "./pages/Settings";

function AppRoutes() {
  const { auth, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="login-spinner" />
      </div>
    );
  }

  if (!auth) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {auth.keyType === "admin" && (
        <Route path="/dashboard" element={<AdminDashboard />} />
      )}
      <Route path="/personal" element={<PersonalDashboard />} />
      <Route path="/settings" element={<Settings />} />
      <Route
        path="*"
        element={
          <Navigate
            to={auth.keyType === "admin" ? "/dashboard" : "/personal"}
            replace
          />
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
