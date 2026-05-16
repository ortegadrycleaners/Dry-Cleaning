import { useState, useCallback } from 'react';
import type { z } from 'zod';
import type { customerSchema } from '@/lib/customerSchema';

type CustomerFormOutput = z.infer<typeof customerSchema>;

interface CreatedOrderInfo {
  publicId: string;
  orderNumber: string;
  customerName: string;
  trackingUrl: string;
}

interface SubmitResult {
  success: boolean;
  error?: string;
}

interface UseCustomerWizardReturn {
  isModalOpen: boolean;
  pendingCustomerData: CustomerFormOutput | null;
  showSuccessModal: boolean;
  successInfo: CreatedOrderInfo | null;
  submitError: string | null;
  openModal: (data: Partial<CustomerFormOutput>) => void;
  closeModal: () => void;
  setSubmitError: (error: string | null) => void;
  setSuccessInfo: (info: CreatedOrderInfo | null) => void;
  resetWizard: () => void;
}

export function useCustomerWizard(): UseCustomerWizardReturn {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingCustomerData, setPendingCustomerData] = useState<CustomerFormOutput | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<CreatedOrderInfo | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openModal = useCallback((data: Partial<CustomerFormOutput>) => {
    setPendingCustomerData({
      name: data.name || '',
      phone: data.phone || '',
      notes: data.notes || '',
      smsConsent: data.smsConsent ?? false,
    });
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setPendingCustomerData(null);
  }, []);

  const resetWizard = useCallback(() => {
    setIsModalOpen(false);
    setPendingCustomerData(null);
    setShowSuccessModal(false);
    setSuccessInfo(null);
    setSubmitError(null);
  }, []);

  return {
    isModalOpen,
    pendingCustomerData,
    showSuccessModal,
    successInfo,
    submitError,
    openModal,
    closeModal,
    setSubmitError,
    setSuccessInfo,
    resetWizard,
  };
}
