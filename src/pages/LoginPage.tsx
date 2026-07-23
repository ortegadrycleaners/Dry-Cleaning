import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, Eye, EyeOff } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { session, loading, login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Si la sesión ya está verificada y existe, redirigir al dashboard
  if (!loading && session) {
    return <Navigate to="/dashboard" replace />;
  }

  const cleanInputValue = (value: string) =>
    value
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF\u2028\u2029]/g, '')
      .replace(/[\r\n]+/g, '')
      .trim();

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>, setValue: (value: string) => void) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData('text');
    setValue(cleanInputValue(pastedText));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError(t('login.missingCredentials'));
      return;
    }

    setIsLoading(true);
    // Limpiar caracteres invisibles (zero-width spaces, saltos de linea, etc) que vienen al copiar y pegar
    const cleanPassword = cleanInputValue(password);
    const cleanEmail = cleanInputValue(email);
    const errorMessage = await login(cleanEmail, cleanPassword);
    setIsLoading(false);

    if (errorMessage) {
      // Traducir los mensajes más comunes de Supabase al español
      if (errorMessage.includes('Invalid login credentials')) {
        setError(t('login.invalidCredentials'));
      } else if (errorMessage.includes('Email not confirmed')) {
        setError(t('login.emailNotConfirmed'));
      } else if (errorMessage.includes('Too many requests')) {
        setError(t('login.tooManyRequests'));
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
          <div className="mx-auto w-16 h-16 bg-[#3B4BFF] rounded-full flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#1B2A4A]">{t('login.title')}</h1>
          <p className="text-sm text-gray-500">{t('login.subtitle')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                {t('common.email')}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onPaste={(e) => handlePaste(e, setEmail)}
                disabled={isLoading}
                className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                {t('common.password')}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onPaste={(e) => handlePaste(e, setPassword)}
                  disabled={isLoading}
                  className="h-11 border-gray-200 focus:border-[#3B4BFF] focus:ring-[#3B4BFF] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-[#3B4BFF] hover:bg-[#2F3DE6] text-white font-medium"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('app.loading')}
                </span>
              ) : (
                t('login.submit')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
