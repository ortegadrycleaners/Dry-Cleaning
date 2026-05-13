import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface RequireAuthProps {
  children: ReactNode;
}

/** Protege rutas internas verificando la sesión real de Supabase Auth. */
export function RequireAuth({ children }: RequireAuthProps) {
  const { session, loading } = useAuth();

  // Mientras Supabase verifica la sesión existente, no redirigir aún
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Cargando…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
