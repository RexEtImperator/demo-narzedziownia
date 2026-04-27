import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../contexts/LanguageContext';
import { errorTracker } from '../services/errorTracking';

class ScreenErrorBoundaryClass extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`Error in screen ${this.props.screenName}:`, error, errorInfo);
    errorTracker.capture(error, { type: 'screen_error', screen: this.props.screenName });
  }

  render() {
    const { t, screenName } = this.props;

    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg border border-red-100 dark:border-red-900/30 max-w-lg w-full">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {t('ErrorBoundary.screenError.title', { screenName })}
            </h2>
            
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {t('ErrorBoundary.screenError.message', 'Wystąpił nieoczekiwany błąd podczas wyświetlania tego ekranu.')}
            </p>

            {this.state.error && (
              <div className="text-left bg-slate-50 dark:bg-slate-900 p-4 rounded-lg mb-6 overflow-auto max-h-40 border border-slate-200 dark:border-slate-700">
                <code className="text-xs text-red-500 font-mono block">
                  {this.state.error.toString()}
                </code>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <ArrowPathIcon className="w-5 h-5 mr-2" aria-hidden="true" />
              {t('ErrorBoundary.refresh') || 'Refresh'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const ScreenErrorBoundary = ({ children, screenName }) => {
  const { t } = useLanguage();
  return <ScreenErrorBoundaryClass t={t} screenName={screenName}>{children}</ScreenErrorBoundaryClass>;
};

export default ScreenErrorBoundary;
