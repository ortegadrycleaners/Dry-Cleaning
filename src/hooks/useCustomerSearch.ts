import { useState, useRef, useCallback } from 'react';
import type { Customer } from '@/types';
import { searchCustomersByPhone } from '@/services/supabase/customersService';

interface UseCustomerSearchReturn {
  phone: string;
  setPhone: (value: string) => void;
  suggestions: Customer[];
  showSuggestions: boolean;
  selectedCustomer: Customer | null;
  selectCustomer: (customer: Customer) => void;
  clearSearch: () => void;
  resetPhone: () => void;
}

export function useCustomerSearch(debounceMs: number = 300): UseCustomerSearchReturn {
  const [phone, setPhoneState] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhone = useCallback((value: string) => {
    setPhoneState(value);
    setShowSuggestions(true);
    setSelectedCustomer(null);

    if (!value) {
      setSuggestions([]);
      return;
    }

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new debounced search
    debounceRef.current = setTimeout(() => {
      searchCustomersByPhone(value).then(setSuggestions);
    }, debounceMs);
  }, [debounceMs]);

  const selectCustomer = useCallback((customer: Customer) => {
    setPhoneState(customer.phone);
    setSelectedCustomer(customer);
    setShowSuggestions(false);
    setSuggestions([]);
  }, []);

  const clearSearch = useCallback(() => {
    setPhoneState('');
    setSuggestions([]);
    setSelectedCustomer(null);
    setShowSuggestions(false);
  }, []);

  const resetPhone = useCallback(() => {
    setPhoneState('');
    setShowSuggestions(false);
  }, []);

  return {
    phone,
    setPhone,
    suggestions,
    showSuggestions,
    selectedCustomer,
    selectCustomer,
    clearSearch,
    resetPhone,
  };
}
