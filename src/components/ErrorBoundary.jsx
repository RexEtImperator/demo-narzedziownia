import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

class ErrorBoundaryClass extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    const { t } = this.props;

    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl max-w-xl w-full text-center border border-slate-200 dark:border-slate-700">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              {t('ErrorBoundary.title')}
            </h1>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              {t('ErrorBoundary.message')}
            </p>
            {this.state.error && (
              <pre className="bg-slate-100 dark:bg-slate-900 p-4 rounded text-left overflow-y-auto text-xs text-red-500 mb-6 max-h-48">
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              {t('ErrorBoundary.refresh')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const ErrorBoundary = ({ children }) => {
  const { t } = useLanguage();
  return <ErrorBoundaryClass t={t}>{children}</ErrorBoundaryClass>;
};

export default ErrorBoundary;
