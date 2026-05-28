import type { ReactNode } from 'react';
import { useParams, Navigate } from 'react-router-dom';

/** Id opaco (hash tipo Base62) o UUID legacy en la URL `/tracking/:orderId`. */
const TRACKING_PUBLIC_ID_REGEX = /^[0-9A-Za-z]{1,48}$/;
const TRACKING_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface TrackingGuardProps {
  children: ReactNode;
}

export function TrackingGuard({ children }: TrackingGuardProps) {
  const { orderId } = useParams<{ orderId: string }>();

  if (
    !orderId ||
    (!TRACKING_PUBLIC_ID_REGEX.test(orderId) && !TRACKING_UUID_REGEX.test(orderId))
  ) {
    return <Navigate to="/not-found" replace />;
  }

  return <>{children}</>;
}
