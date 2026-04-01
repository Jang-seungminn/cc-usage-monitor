import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import PersonalDashboard from "./pages/PersonalDashboard";
import Settings from "./pages/Settings";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const hasKey = !!sessionStorage.getItem("apiKey");
  return hasKey ? <>{children}</> : <Navigate to="/" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/personal"
          element={
            <RequireAuth>
              <PersonalDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
