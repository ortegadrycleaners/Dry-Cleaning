import React from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { customerSchema } from '../lib/customerSchema';
import { useI18n } from '../i18n';
import './CustomerModal.css';

type CustomerData = z.infer<typeof customerSchema>;

interface SubmitResult {
  success: boolean;
  error?: string;
}

interface CustomerModalProps {
  isOpen: boolean;
  initialData?: Partial<CustomerData>;
  onSubmit: (data: CustomerData) => Promise<SubmitResult>;
  onClose: () => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ isOpen, initialData, onSubmit, onClose }) => {
  const { t } = useI18n();
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isValid } } = useForm<CustomerData>({
    resolver: zodResolver(customerSchema),
    mode: 'onChange',
    defaultValues: { name: '', phone: '', smsConsent: false, termsConsent: false },
  });

  React.useEffect(() => {
    if (isOpen) {
      reset({
        name: initialData?.name || '',
        phone: initialData?.phone || '',
        smsConsent: initialData?.smsConsent || false,
        termsConsent: false,
      });
      // Update URL hash when modal opens
      window.history.replaceState(null, '', '#consent');
    }
  }, [isOpen, initialData, reset]);

  const onSubmitForm: SubmitHandler<CustomerData> = async (data) => {
    setIsSubmitting(true);
    setSubmitError(null);
    const result = await onSubmit(data);
    setIsSubmitting(false);

    if (result.success) {
      setShowSuccess(true);
      reset();
    } else {
      setShowSuccess(false);
      setSubmitError(result.error ?? t('customerModal.registrationError'));
    }
  };

  const handleClose = () => {
    setShowSuccess(false);
    setIsSubmitting(false);
    reset();
    // Remove hash from URL when modal closes
    window.history.replaceState(null, '', window.location.pathname);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${isOpen ? 'active' : ''}`}>
      <div className="modal-container">
        {/* Lado Izquierdo: Visual */}
        <div className="modal-image-section">
          <div className="modal-image-overlay">
            <h2>{t('customerModal.heroTitle')}</h2>
            <p>{t('customerModal.heroSubtitle')}</p>
          </div>
        </div>

        {/* Lado Derecho: Formulario */}
        <div className="modal-form-section">
          <button className="close-btn" onClick={handleClose} aria-label={t('customerModal.close')}>&times;</button>

          <div id="formContent" style={{ display: showSuccess ? 'none' : 'block' }}>
            <div className="form-header">
              <h3>{t('customerModal.title')}</h3>
              <p>{t('customerModal.description')}</p>
            </div>

            <form id="customerForm" onSubmit={handleSubmit(onSubmitForm)} autoComplete="off">
            {submitError && (
              <div className="error-message" style={{ marginBottom: '1rem' }}>
                {submitError}
              </div>
            )}
              {/* Full Name */}
              <div className="form-group">
                <label htmlFor="name" className="form-label">{t('customerModal.fullName')}</label>
                <input
                  type="text"
                  id="name"
                  className={`form-input ${errors.name ? 'error' : ''}`}
                  placeholder={t('customerModal.fullNamePlaceholder')}
                  {...register('name')}
                />
                {errors.name && <span className="error-message">{errors.name.message}</span>}
              </div>

              {/* Phone Number */}
              <div className="form-group">
                <label htmlFor="phoneNumber" className="form-label">{t('customerModal.phoneNumber')}</label>
                <input
                  type="tel"
                  id="phoneNumber"
                  className={`form-input ${errors.phone ? 'error' : ''}`}
                  placeholder={t('customerModal.phoneNumberPlaceholder')}
                  {...register('phone')}
                />
                {errors.phone && <span className="error-message">{errors.phone.message}</span>}
              </div>

              {/* Contact Info */}
              <div style={{ marginTop: '1rem', marginBottom: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#f0f4ff', borderRadius: '0.375rem', borderLeft: '3px solid #3B4BFF' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1B2A4A', marginBottom: '0.35rem' }}>{t('customerModal.contactUsLabel')}</p>
                <p style={{ fontSize: '0.8rem', color: '#444', margin: 0 }}>
                  📞 <a href="tel:+19046660809" style={{ color: '#3B4BFF', textDecoration: 'none' }}>+1 904 666 0809</a>
                  &nbsp;&nbsp;✉️ <a href="mailto:info@ortegadrycleaners.com" style={{ color: '#3B4BFF', textDecoration: 'none' }}>info@ortegadrycleaners.com</a>
                </p>
              </div>

              {/* SMS Consent - MANDATORY */}
              <div className="checkbox-group" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                <div className="checkbox-description">
                  <p className="checkbox-title">
                    {t('customerModal.consentTitle')}
                  </p>
                  <p className="checkbox-subtitle">
                    {t('customerModal.consentDescription')}
                  </p>
                </div>
                <div className="checkbox-row">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      id="smsConsent"
                      {...register('smsConsent')}
                      required
                    />
                    <span className="checkmark"></span>
                  </label>
                  <span className="checkbox-text" style={{ color: errors.smsConsent ? '#dc2626' : '#333' }}>
                    {t('customerModal.consentCheckbox')}
                  </span>
                </div>
                {errors.smsConsent && <span className="error-message" style={{ display: 'block', marginTop: '0.25rem' }}>{errors.smsConsent.message}</span>}
              </div>

              {/* Terms & Privacy Consent - MANDATORY */}
              <div className="checkbox-group" style={{ marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                <div className="checkbox-description">
                  <p className="checkbox-title">
                    {t('customerModal.termsTitle')}
                  </p>
                  <p className="checkbox-subtitle">
                    {t('customerModal.termsDescriptionPrefix')}{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#3B4BFF', textDecoration: 'underline' }}>{t('customerModal.termsOfService')}</a>
                    {' '}{t('customerModal.and')}{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#3B4BFF', textDecoration: 'underline' }}>{t('customerModal.privacyPolicy')}</a>.
                  </p>
                </div>
                <div className="checkbox-row">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      id="termsConsent"
                      {...register('termsConsent')}
                      required
                    />
                    <span className="checkmark"></span>
                  </label>
                  <span className="checkbox-text" style={{ color: errors.termsConsent ? '#dc2626' : '#333' }}>
                    {t('customerModal.termsCheckboxPrefix')}{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#3B4BFF' }}>{t('customerModal.terms')}</a>
                    {' '}{t('customerModal.and')}{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#3B4BFF' }}>{t('customerModal.privacyPolicy')}</a>
                  </span>
                </div>
                {errors.termsConsent && <span className="error-message" style={{ display: 'block', marginTop: '0.25rem' }}>{errors.termsConsent.message}</span>}
              </div>

              <button type="submit" className="submit-btn" disabled={isSubmitting || !isValid} style={{ marginTop: '1.5rem', opacity: !isValid ? 0.5 : 1, cursor: !isValid ? 'not-allowed' : 'pointer' }}>
                {isSubmitting ? t('customerModal.processing') : t('customerModal.submit')}
              </button>
            </form>
          </div>

          {/* Success State */}
          <div className="success-message" style={{ display: showSuccess ? 'block' : 'none' }}>
            <div className="success-icon">✓</div>
            <h4 className="success-title">{t('customerModal.successTitle')}</h4>
            <p className="success-text">{t('customerModal.successText')}</p>
            <button className="submit-btn" style={{ marginTop: '1.5rem' }} onClick={handleClose}>{t('customerModal.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};