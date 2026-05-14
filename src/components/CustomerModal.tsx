import React from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { customerSchema } from '../lib/customerSchema';
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
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isValid } } = useForm<CustomerData>({
    resolver: zodResolver(customerSchema),
    mode: 'onChange',
    defaultValues: { name: '', phone: '', smsConsent: false },
  });

  React.useEffect(() => {
    if (isOpen) {
      reset({
        name: initialData?.name || '',
        phone: initialData?.phone || '',
        smsConsent: initialData?.smsConsent || false,
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
      setSubmitError(result.error ?? 'No se pudo registrar el cliente. Por favor revisa los datos e intenta de nuevo.');
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
            <h2>Much more than cleaning.</h2>
            <p>We take care of what you value most.</p>
          </div>
        </div>

        {/* Lado Derecho: Formulario */}
        <div className="modal-form-section">
          <button className="close-btn" onClick={handleClose} aria-label="Close">&times;</button>

          <div id="formContent" style={{ display: showSuccess ? 'none' : 'block' }}>
            <div className="form-header">
              <h3>Customer Data Registration</h3>
              <p>Please provide your information. Explicit consent is required to proceed.</p>
            </div>

            <form id="customerForm" onSubmit={handleSubmit(onSubmitForm)} autoComplete="off">
            {submitError && (
              <div className="error-message" style={{ marginBottom: '1rem' }}>
                {submitError}
              </div>
            )}
              {/* Full Name */}
              <div className="form-group">
                <label htmlFor="name" className="form-label">Full Name</label>
                <input
                  type="text"
                  id="name"
                  className={`form-input ${errors.name ? 'error' : ''}`}
                  placeholder="John Garcia"
                  {...register('name')}
                />
                {errors.name && <span className="error-message">{errors.name.message}</span>}
              </div>

              {/* Phone Number */}
              <div className="form-group">
                <label htmlFor="phoneNumber" className="form-label">Phone Number</label>
                <input
                  type="tel"
                  id="phoneNumber"
                  className={`form-input ${errors.phone ? 'error' : ''}`}
                  placeholder="(787) 555-1234"
                  {...register('phone')}
                />
                {errors.phone && <span className="error-message">{errors.phone.message}</span>}
              </div>

              {/* SMS Consent - MANDATORY */}
              <div className="checkbox-group" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                <div className="checkbox-description">
                  <p className="checkbox-title">
                    ✓ Explicit Consent (Required)
                  </p>
                  <p className="checkbox-subtitle">
                    By checking this box, I confirm that I give explicit consent for my personal data to be registered and used exclusively to manage this order and send me SMS notifications about the status of my order.
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
                    I accept and authorize the registration of my data and SMS notifications
                  </span>
                </div>
                {errors.smsConsent && <span className="error-message" style={{ display: 'block', marginTop: '0.25rem' }}>{errors.smsConsent.message}</span>}
              </div>

              <button type="submit" className="submit-btn" disabled={isSubmitting || !isValid} style={{ marginTop: '1.5rem', opacity: !isValid ? 0.5 : 1, cursor: !isValid ? 'not-allowed' : 'pointer' }}>
                {isSubmitting ? 'Processing...' : 'Confirm and Register'}
              </button>
            </form>
          </div>

          {/* Success State */}
          <div className="success-message" style={{ display: showSuccess ? 'block' : 'none' }}>
            <div className="success-icon">✓</div>
            <h4 className="success-title">Data Registered!</h4>
            <p className="success-text">Thank you for your consent. Your data has been registered and you will receive SMS notifications about your order status.</p>
            <button className="submit-btn" style={{ marginTop: '1.5rem' }} onClick={handleClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};