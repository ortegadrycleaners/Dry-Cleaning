import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '@/context/OrdersContext';
import { mockCustomers } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowLeft, Calendar } from 'lucide-react';

export function NewOrderPage() {
  const navigate = useNavigate();
  const { addOrder } = useOrders();
  const [orderId, setOrderId] = useState('');
  const [phone, setPhone] = useState('');
  const [lastName, setLastName] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredCustomers = useMemo(() => {
    if (!phone.trim() || phone.length < 3) return [];
    const query = phone.toLowerCase().replace(/[\s\-\(\)]/g, '');
    return mockCustomers.filter(customer =>
      customer.phone.toLowerCase().replace(/[\s\-\(\)]/g, '').includes(query)
    ).slice(0, 5);
  }, [phone]);

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    setShowSuggestions(value.length >= 3);
    // Clear last name if phone is cleared
    if (!value) {
      setLastName('');
    }
  };

  const handleCustomerSelect = (customer: typeof mockCustomers[0]) => {
    setPhone(customer.phone);
    setLastName(customer.lastName);
    setShowSuggestions(false);
  };

  const handleQuickDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setEstimatedDate(date.toISOString().split('T')[0]);
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    };
    return date.toLocaleDateString('es-ES', options);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!orderId.trim()) {
      newErrors.orderId = 'El ID de orden es requerido';
    }

    if (!phone.trim()) {
      newErrors.phone = 'El teléfono es requerido';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'El apellido es requerido';
    }

    if (!estimatedDate) {
      newErrors.estimatedDate = 'La fecha estimada es requerida';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const newOrder = {
      id: orderId,
      customerName: lastName,
      phone: phone,
      estimatedDate: formatDateDisplay(estimatedDate),
      status: 'RECIBIDO' as const,
      createdAt: new Date().toISOString().split('T')[0],
    };

    addOrder(newOrder);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              <span className="text-sm font-medium">Volver</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-4">
            <h1 className="text-2xl font-bold text-[#1B2A4A]">Nueva Orden</h1>
            <p className="text-sm text-gray-500">
              Ingresa los datos del cliente y la orden
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Order ID */}
              <div className="space-y-2">
                <Label htmlFor="orderId" className="text-sm font-medium text-gray-700">
                  ID de Orden
                </Label>
                <Input
                  id="orderId"
                  type="text"
                  placeholder="Ej. 1043"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                />
                {errors.orderId && (
                  <p className="text-sm text-red-600">{errors.orderId}</p>
                )}
              </div>

              {/* Phone with Autocomplete */}
              <div className="space-y-2 relative">
                <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                  Teléfono
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(787) 555-XXXX"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  onFocus={() => phone.length >= 3 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                />
                {errors.phone && (
                  <p className="text-sm text-red-600">{errors.phone}</p>
                )}

                {/* Autocomplete Suggestions */}
                {showSuggestions && filteredCustomers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                    {filteredCustomers.map((customer, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleCustomerSelect(customer)}
                        className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-gray-100 last:border-0"
                      >
                        <span className="text-sm font-medium text-[#1B2A4A]">
                          {customer.phone}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          — {customer.lastName}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Last Name */}
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                  Apellido
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Apellido del cliente"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                />
                {errors.lastName && (
                  <p className="text-sm text-red-600">{errors.lastName}</p>
                )}
              </div>

              {/* Estimated Delivery Date */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700">
                  Fecha Estimada de Entrega
                </Label>
                
                {/* Quick Select Buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleQuickDate(1)}
                    className="flex-1 h-10 border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                  >
                    + 1 día
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleQuickDate(3)}
                    className="flex-1 h-10 border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                  >
                    + 3 días
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleQuickDate(5)}
                    className="flex-1 h-10 border-gray-200 hover:bg-slate-50 hover:border-[#C9A84C]"
                  >
                    + 5 días
                  </Button>
                </div>

                {/* Date Picker */}
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="date"
                    value={estimatedDate}
                    onChange={(e) => setEstimatedDate(e.target.value)}
                    className="pl-10 h-11 border-gray-200 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                  />
                </div>
                {estimatedDate && (
                  <p className="text-sm text-gray-500">
                    Fecha seleccionada: {formatDateDisplay(estimatedDate)}
                  </p>
                )}
                {errors.estimatedDate && (
                  <p className="text-sm text-red-600">{errors.estimatedDate}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 space-y-3">
                <Button
                  type="submit"
                  className="w-full h-12 bg-[#1B2A4A] hover:bg-[#2a3d66] text-white font-medium"
                >
                  Crear Orden y Enviar SMS
                </Button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="w-full h-10 text-gray-500 hover:text-gray-700 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
