import React, { useState } from 'react';
import './CustomerModal.css';

interface CustomerData {
  fullName: string;
  phone: string;
  smsConsent: boolean;
}

interface CustomerModalProps {
  isOpen: boolean;
  onSubmit: (data: CustomerData) => void;
  onClose: () => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ isOpen, onSubmit, onClose }) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      onSubmit({ fullName, phone, smsConsent });
      setShowSuccess(true);
      setIsSubmitting(false);
    }, 800);
  };

  const handleClose = () => {
    setShowSuccess(false);
    setFullName('');
    setPhone('');
    setSmsConsent(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${isOpen ? 'active' : ''}`}>
      <div className="modal-container">
        {/* Left Side: Visual */}
        <div className="modal-image-section">
          <div className="modal-image-overlay">
            <h2>Much more than cleaning.</h2>
            <p>We take care of what you value most.</p>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="modal-form-section">
          <button className="close-btn" onClick={handleClose} aria-label="Close">&times;</button>

          <div id="formContent" style={{ display: showSuccess ? 'none' : 'block' }}>
            <div className="form-header">
              <h3>Customer Information</h3>
              <p>Please provide your details to proceed with the service agreement.</p>
            </div>

            <form id="customerForm" onSubmit={handleSubmit}>
              {/* Full Name */}
              <div className="form-group">
                <label htmlFor="fullName" className="form-label">Full Name</label>
                <input
                  type="text"
                  id="fullName"
                  className="form-input"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              {/* Phone Number */}
              <div className="form-group">
                <label htmlFor="phoneNumber" className="form-label">Phone Number</label>
                <input
                  type="tel"
                  id="phoneNumber"
                  className="form-input"
                  placeholder="(555) 123-4567"
                  pattern="[0-9+\-\(\)\s]*"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              {/* SMS Consent */}
              <div className="checkbox-group">
                <label className="custom-checkbox">
                  <input
                    type="checkbox"
                    id="smsConsent"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    required
                  />
                  <span className="checkmark"></span>
                </label>
                <span className="checkbox-text">
                  I agree to receive an SMS notification when my order is ready.
                </span>
              </div>

              {/* Submit Button */}
              <button type="submit" className="submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Processing...' : 'Accept & Continue'}
              </button>
            </form>
          </div>

          {/* Success State */}
          <div id="successMessage" className="success-message" style={{ display: showSuccess ? 'block' : 'none' }}>
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