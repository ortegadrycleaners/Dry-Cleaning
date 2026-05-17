import React, { type ReactNode } from 'react';
import { I18nContext } from '@/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <I18nContext.Consumer>
          {(context) => {
            const t = context?.t ?? ((key: string) => key);
            return (
              <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
                  <h1 className="text-2xl font-bold text-red-600 mb-4">{t('error.title')}</h1>
                  <p className="text-gray-700 mb-4">{t('error.unexpected')}</p>
                  <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto text-red-700 mb-4">
                    {this.state.error?.message}
                  </pre>
                  <p className="text-sm text-gray-600 mb-4">{t('error.console')}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                  >
                    {t('error.reload')}
                  </button>
                </div>
              </div>
            );
          }}
        </I18nContext.Consumer>
      );
    }

    return this.props.children;
  }
}
