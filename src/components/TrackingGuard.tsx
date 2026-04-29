import type { ReactNode } from 'react';
import { useParams, Navigate } from 'react-router-dom';

/** Id opaco (hash tipo Base62) en la URL `/tracking/:orderId`; alfanumérico sin otros símbolos. */
const TRACKING_PUBLIC_ID_REGEX = /^[0-9A-Za-z]{1,48}$/;

interface TrackingGuardProps {
  children: ReactNode;
}

export function TrackingGuard({ children }: TrackingGuardProps) {
  const { orderId } = useParams<{ orderId: string }>();

  if (!orderId || !TRACKING_PUBLIC_ID_REGEX.test(orderId)) {
    return <Navigate to="/not-found" replace />;
  }

  return <>{children}</>;
}
