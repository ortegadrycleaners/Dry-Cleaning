import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/components/RequireAuth';
import { TrackingGuard } from '@/components/TrackingGuard';
import { AuthProvider } from '@/context/AuthContext';
import { OrdersProvider } from '@/context/OrdersContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { Toaster } from '@/components/ui/sonner';

const LoginPage = lazy(async () => ({
  default: (await import('@/pages/LoginPage')).LoginPage,
}));
const DashboardPage = lazy(async () => ({
  default: (await import('@/pages/DashboardPage')).DashboardPage,
}));
const NewOrderPage = lazy(async () => ({
  default: (await import('@/pages/NewOrderPage')).NewOrderPage,
}));
const TrackingPage = lazy(async () => ({
  default: (await import('@/pages/TrackingPage')).TrackingPage,
}));
const NotFoundPage = lazy(async () => ({
  default: (await import('@/pages/NotFoundPage')).default,
}));

function App() {
  return (
    <AuthProvider>
      <OrdersProvider>
        <NotificationsProvider>
          <BrowserRouter>
            <Suspense fallback={<div className="p-4 text-sm text-gray-600">Cargando…</div>}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/dashboard"
                  element={
                    <RequireAuth>
                      <DashboardPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/dashboard/nueva"
                  element={
                    <RequireAuth>
                      <NewOrderPage />
                    </RequireAuth>
                  }
                />
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
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </NotificationsProvider>
      </OrdersProvider>
    </AuthProvider>
  );
}

export default App;
