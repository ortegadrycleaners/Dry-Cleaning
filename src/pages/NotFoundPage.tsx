import React from 'react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <h1 className="text-4xl font-bold text-red-600 mb-4">404</h1>
      <p className="text-lg text-gray-700 mb-2">No encontramos la orden solicitada.</p>
      <a href="/" className="text-blue-600 hover:underline">Volver al inicio</a>
    </div>
  );
}
