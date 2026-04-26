import { useParams, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';

// Simple UUID v4 regex
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface TrackingGuardProps {
  children: ReactNode;
}

export function TrackingGuard({ children }: TrackingGuardProps) {
  const { orderId } = useParams<{ orderId: string }>();

  if (!orderId || !UUID_V4_REGEX.test(orderId)) {
    // Redirect to a not found or error page
    return <Navigate to="/not-found" replace />;
  }

  return <>{children}</>;
}
