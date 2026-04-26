import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NewOrderPage } from '@/pages/NewOrderPage';
import { TrackingPage } from '@/pages/TrackingPage';
import { TrackingGuard } from '@/components/TrackingGuard';
import NotFoundPage from '@/pages/NotFoundPage';
import { AuthProvider } from '@/context/AuthContext';
import { OrdersProvider } from '@/context/OrdersContext';

function App() {
  return (
    <AuthProvider>
      <OrdersProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/nueva" element={<NewOrderPage />} />
            <Route
              path="/tracking/:orderId"
              element={
                <TrackingGuard>
                  <TrackingPage />
                </TrackingGuard>
              }
            />
            <Route path="/not-found" element={<NotFoundPage />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </OrdersProvider>
    </AuthProvider>
  );
}

export default App;
