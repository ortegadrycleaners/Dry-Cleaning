import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2 } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Por favor ingresa email y contraseña');
      return;
    }

    setIsLoading(true);
    const errorMessage = await login(email.trim(), password);
    setIsLoading(false);

    if (errorMessage) {
      // Traducir los mensajes más comunes de Supabase al español
      if (errorMessage.includes('Invalid login credentials')) {
        setError('Email o contraseña incorrectos');
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('Debes confirmar tu email antes de ingresar');
      } else if (errorMessage.includes('Too many requests')) {
        setError('Demasiados intentos. Espera unos minutos');
      } else {
        setError(errorMessage);
      }
      return;
    }

    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-[#1B2A4A] rounded-full flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-[#C9A84C]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1B2A4A]">Ortega Dry Cleaners</h1>
          <p className="text-sm text-gray-500">Sistema de Gestión de Órdenes</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-[#1B2A4A] hover:bg-[#2a3d66] text-white font-medium"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando…
                </span>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
