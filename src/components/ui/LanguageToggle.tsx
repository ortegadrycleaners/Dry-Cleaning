import { Button } from './button'
import { useI18n } from '@/i18n'

export function LanguageToggle({ inline }: { inline?: boolean }) {
  const { locale, setLocale, t } = useI18n()

  function toggle() {
    setLocale(locale === 'es' ? 'en' : 'es')
  }

  const btn = (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={t('common.changeLanguage')}
      className={inline ? 'text-[#FAFAFC]/90 hover:text-white' : undefined}
    >
      {locale === 'es' ? 'ES' : 'EN'}
    </Button>
  )

  if (inline) return btn

  return (
    <div className="fixed top-6 right-6 z-50 md:hidden">{btn}</div>
  )
}

export default LanguageToggle
