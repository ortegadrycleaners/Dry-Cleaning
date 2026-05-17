import { useI18n } from '@/i18n';

export default function NotFoundPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <h1 className="text-4xl font-bold text-red-600 mb-4">{t('notFound.title')}</h1>
      <p className="text-lg text-gray-700 mb-2">{t('notFound.message')}</p>
      <a href="/" className="text-blue-600 hover:underline">{t('notFound.returnHome')}</a>
    </div>
  );
}
