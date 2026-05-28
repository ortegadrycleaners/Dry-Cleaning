import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';

interface RequireAuthProps {
  children: ReactNode;
}

/** Protege rutas internas verificando la sesión real de Supabase Auth. */
export function RequireAuth({ children }: RequireAuthProps) {
  const { session, loading } = useAuth();
  const { t } = useI18n();

  // Mientras Supabase verifica la sesión existente, no redirigir aún
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        {t('requireAuth.loading')}
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
