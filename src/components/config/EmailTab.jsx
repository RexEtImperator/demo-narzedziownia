import React, { useState } from 'react';
import { notifyError, notifySuccess } from '../../utils/notify.jsx';
import { validateEmailConfig } from '../../utils/validators';

const EmailTab = ({ 
  config, 
  onEmailFieldChange, 
  emailErrors, 
  setEmailErrors, 
  apiClient, 
  t 
}) => {
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState('');

  const handleTestEmail = async () => {
    setTestResult('');
    const validCfg = validateEmailConfig(config.email, t);
    setEmailErrors(validCfg.errors);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!validCfg.isValid) {
      setTestResult(t('appConfig.email.test.fixConfig'));
      notifyError(t('appConfig.email.test.fixConfig'));
      return;
    }
    
    if (!testEmail || !emailRegex.test(testEmail)) {
      setTestResult(t('appConfig.email.test.invalidRecipient'));
      notifyError(t('appConfig.email.test.invalidRecipient'));
      return;
    }

    try {
      setIsSendingTest(true);
      await apiClient.post('/api/config/email/test', { to: testEmail });
      setTestResult(t('appConfig.email.test.success'));
      notifySuccess(t('appConfig.email.test.success'));
    } catch (err) {
      setTestResult(`${t('appConfig.email.test.error')}: ${err?.message || err}`);
      notifyError(`${t('appConfig.email.test.error')}: ${err?.message || err}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="email-host" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.email.host')}</label>
            <input
              id="email-host"
              name="emailHost"
              type="text"
              value={config.email.host}
              onChange={(e) => onEmailFieldChange('host', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
            {emailErrors.host && (<p className="mt-1 text-xs text-red-600">{emailErrors.host}</p>)}
          </div>
          <div>
            <label htmlFor="email-port" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.email.port')}</label>
            <input
              id="email-port"
              name="emailPort"
              type="number"
              value={config.email.port}
              onChange={(e) => onEmailFieldChange('port', parseInt(e.target.value) || 0)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
            {emailErrors.port && (<p className="mt-1 text-xs text-red-600">{emailErrors.port}</p>)}
          </div>
          <div>
            <label htmlFor="email-secure" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.email.secure')}</label>
            <select
              id="email-secure"
              name="emailSecure"
              value={config.email.secure ? 'YES' : 'NO'}
              onChange={(e) => onEmailFieldChange('secure', e.target.value === 'YES')}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="YES">{t('appConfig.email.yes')}</option>
              <option value="NO">{t('appConfig.email.no')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="email-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.email.user')}</label>
            <input
              id="email-user"
              name="emailUser"
              type="text"
              value={config.email.user}
              onChange={(e) => onEmailFieldChange('user', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="email-pass" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.email.pass')}</label>
            <input
              id="email-pass"
              name="emailPass"
              type="password"
              value={config.email.pass}
              onChange={(e) => onEmailFieldChange('pass', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="email-from" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.email.from')}</label>
            <input
              id="email-from"
              name="emailFrom"
              type="text"
              value={config.email.from}
              onChange={(e) => onEmailFieldChange('from', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
            {emailErrors.from && (<p className="mt-1 text-xs text-red-600">{emailErrors.from}</p>)}
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('appConfig.email.description')}</p>
      </div>
      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
        <h4 className="text-md font-medium text-gray-900 dark:text-white mb-2">{t('appConfig.email.test.title')}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('appConfig.email.test.description')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-end">
          <div>
            <label htmlFor="email-test-recipient" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('appConfig.email.test.recipient')}</label>
            <input
              id="email-test-recipient"
              name="emailTestRecipient"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder={t('appConfig.email.test.recipientPlaceholder')}
              className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500"
            />
          </div>
          <div>
            <button
              type="button"
              onClick={handleTestEmail}
              disabled={isSendingTest}
              className={`inline-flex items-center px-4 py-2 rounded-md text-white ${isSendingTest ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              {isSendingTest ? t('appConfig.email.test.sending') : t('appConfig.email.test.send')}
            </button>
            {testResult && (<p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{testResult}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailTab;
