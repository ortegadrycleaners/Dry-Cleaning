import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerSchema } from '../lib/customerSchema';
import './CustomerModal.css';

type CustomerData = {
  name: string;
  phone: string;
  smsConsent: boolean;
  notes?: string;
};

interface CustomerModalProps {
  isOpen: boolean;
  initialData?: Partial<CustomerData>;
  onSubmit: (data: CustomerData) => void;
  onClose: () => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ isOpen, initialData, onSubmit, onClose }) => {
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerData>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', smsConsent: false, notes: '' },
  });

  React.useEffect(() => {
    if (isOpen) {
      reset({
        name: initialData?.name || '',
        phone: initialData?.phone || '',
        notes: initialData?.notes || '',
        smsConsent: initialData?.smsConsent || false,
      });
      setShowSuccess(false);
      setIsSubmitting(false);
    }
  }, [isOpen, initialData, reset]);

  const onSubmitForm = (data: CustomerData) => {
    setIsSubmitting(true);
    // Simulación de carga para feedback visual
    setTimeout(() => {
      onSubmit(data);
      setShowSuccess(true);
      setIsSubmitting(false);
      reset();
    }, 800);
  };

  const handleClose = () => {
    setShowSuccess(false);
    reset();
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
              <h3>Customer Information</h3>
              <p>Please provide your details to proceed with the service agreement.</p>
            </div>

            <form id="customerForm" onSubmit={handleSubmit(onSubmitForm)} autoComplete="off">
              {/* Full Name */}
              <div className="form-group">
                <label htmlFor="name" className="form-label">Full Name</label>
                <input
                  type="text"
                  id="name"
                  className={`form-input ${errors.name ? 'error' : ''}`}
                  placeholder="John Doe"
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
                  placeholder="(555) 123-4567"
                  {...register('phone')}
                />
                {errors.phone && <span className="error-message">{errors.phone.message}</span>}
              </div>

              {/* Notas del Pedido */}
              <div className="form-group">
                <label htmlFor="notes" className="form-label">Order Notes</label>
                <textarea
                  id="notes"
                  className="form-input"
                  placeholder="Additional notes (optional)"
                  {...register('notes')}
                  maxLength={200}
                />
              </div>

              {/* SMS Consent */}
              <div className="checkbox-group">
                <label className="custom-checkbox">
                  <input
                    type="checkbox"
                    id="smsConsent"
                    {...register('smsConsent')}
                  />
                  <span className="checkmark"></span>
                </label>
                <span className="checkbox-text">
                  I agree to receive an SMS notification when my order is ready.
                </span>
              </div>

              <button type="submit" className="submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Processing...' : 'Accept & Continue'}
              </button>
            </form>
          </div>

          {/* Success State */}
          <div className="success-message" style={{ display: showSuccess ? 'block' : 'none' }}>
            <div className="success-icon">&#10003;</div>
            <h4 className="success-title">Information Received</h4>
            <p className="success-text">Thank you! We have recorded your preferences and will notify you via SMS.</p>
            <button className="submit-btn" style={{ marginTop: '1.5rem' }} onClick={handleClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};