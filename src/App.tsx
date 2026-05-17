import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/components/RequireAuth';
import { TrackingGuard } from '@/components/TrackingGuard';
import { AuthProvider } from '@/context/AuthContext';
import { OrdersProvider } from '@/context/OrdersContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { Toaster } from '@/components/ui/sonner';
import { I18nProvider } from '@/i18n';

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

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-gray-300 border-t-[#1B2A4A] rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Cargando…</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <OrdersProvider>
        <NotificationsProvider>
          <I18nProvider>
            <BrowserRouter>
              <Suspense fallback={<LoadingFallback />}>
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
          </I18nProvider>
          <Toaster />
        </NotificationsProvider>
      </OrdersProvider>
    </AuthProvider>
  );
}

export default App;
