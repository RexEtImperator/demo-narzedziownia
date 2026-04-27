import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { ShieldExclamationIcon, LockClosedIcon, LightBulbIcon, InformationCircleIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
const SUPPORTED_FORMATS = [
  'qr_code',
  'data_matrix',
  'aztec',
  'pdf_417',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'rss_14',
  'rss_expanded'
];
import BarcodeScanner from 'react-qr-barcode-scanner';

// Add a polyfill for getSupportedConstraints immediately after the module is loaded
if (typeof navigator !== 'undefined' && navigator.mediaDevices && !navigator.mediaDevices.getSupportedConstraints) {
  console.warn('getSupportedConstraints nie jest dostępne, dodaję polyfill');
  navigator.mediaDevices.getSupportedConstraints = function() {
    return {
      width: true,
      height: true,
      aspectRatio: true,
      frameRate: true,
      facingMode: true,
      resizeMode: true,
      deviceId: true,
      groupId: true,
      torch: true,
      zoom: true
    };
  };
}

const BarcodeScannerComponent = ({ 
  isOpen, 
  onClose, 
  onScan, 
  onError,
  displayQuantity,
  onCheckExists,
  onAddTool,
  onAddBhp,
  autoCloseOnScan = true
}) => {
  const { t } = useLanguage();
  const [hasPermission, setHasPermission] = useState(null);
  const [stopStream, setStopStream] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [instanceKey, setInstanceKey] = useState(0);
  const scannerContainerRef = React.useRef(null);
  const [isSupported, setIsSupported] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningAnimation, setScanningAnimation] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [lastScanTime, setLastScanTime] = useState(0);
  const [scanLocked, setScanLocked] = useState(false);
  const [lastErrorAt, setLastErrorAt] = useState(0);
  const [lastErrorMsg, setLastErrorMsg] = useState('');
  const [notFoundCode, setNotFoundCode] = useState('');
  const [recognitionAttempts, setRecognitionAttempts] = useState(0);
  const [noRecognition, setNoRecognition] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

  // Check browser compatibility
  useEffect(() => {
    const checkBrowserSupport = () => {
      // Add polyfill for getUserMedia if it doesn't exist
      if (!navigator.mediaDevices) {
        console.warn('navigator.mediaDevices nie jest dostępne, dodaję polyfill');
        
        // Polyfill for older browsers
        navigator.mediaDevices = {};
        
        // Check if older APIs exist
        if (navigator.getUserMedia) {
          navigator.mediaDevices.getUserMedia = function(constraints) {
            return new Promise(function(resolve, reject) {
              navigator.getUserMedia.call(navigator, constraints, resolve, reject);
            });
          };
        } else if (navigator.webkitGetUserMedia) {
          navigator.mediaDevices.getUserMedia = function(constraints) {
            return new Promise(function(resolve, reject) {
              navigator.webkitGetUserMedia.call(navigator, constraints, resolve, reject);
            });
          };
        } else if (navigator.mozGetUserMedia) {
          navigator.mediaDevices.getUserMedia = function(constraints) {
            return new Promise(function(resolve, reject) {
              navigator.mozGetUserMedia.call(navigator, constraints, resolve, reject);
            });
          };
        } else if (navigator.msGetUserMedia) {
          navigator.mediaDevices.getUserMedia = function(constraints) {
            return new Promise(function(resolve, reject) {
              navigator.msGetUserMedia.call(navigator, constraints, resolve, reject);
            });
          };
        } else {
          if (onError) onError(t('scanner.browserNotSupported.message'));
          setIsSupported(false);
          if (onError) {
            onError(t('scanner.browserNotSupported.message'));
          }
          return false;
        }
        
        // Add getSupportedConstraints to the newly created mediaDevices
        if (!navigator.mediaDevices.getSupportedConstraints) {
          navigator.mediaDevices.getSupportedConstraints = function() {
            return {
              width: true,
              height: true,
              aspectRatio: true,
              frameRate: true,
              facingMode: true,
              resizeMode: true,
              deviceId: true,
              groupId: true,
              torch: true,
              zoom: true
            };
          };
        }
      }

      // Check if getUserMedia is available after adding polyfill
      if (!navigator.mediaDevices.getUserMedia) {
        if (onError) onError(t('scanner.browserNotSupported.message'));
        setIsSupported(false);
        if (onError) {
          onError(t('scanner.browserNotSupported.message'));
        }
        return false;
      }
      return true;
    };

    if (isOpen) {
      const supported = checkBrowserSupport();
      setIsSupported(supported);
    }
  }, [isOpen, onError, t]);

  useEffect(() => {
    if (isOpen) {
      setStopStream(false);
      setIsScanning(true);
      setScanningAnimation(true);
      setTorchEnabled(false);
      setInstanceKey(k => k + 1);
      setRecognitionAttempts(0);
      setNoRecognition(false);
      const detect = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setTorchSupported(false);
            return;
          }
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
          const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
          const track = tracks[0] || null;
          let supported = false;
          if (track && typeof track.getCapabilities === 'function') {
            const caps = track.getCapabilities();
            supported = !!caps?.torch;
          }
          tracks.forEach(tr => { try { tr.stop(); } catch (_) { /* noop */ } });
          setTorchSupported(supported);
        } catch (_) {
          setTorchSupported(false);
        }
      };
      detect();
      let canceled = false;
      const tryFocus = async () => {
        try {
          const root = scannerContainerRef.current;
          if (!root) return;
          const video = root.querySelector('video');
          const stream = video && video.srcObject ? video.srcObject : null;
          const tracks = stream && stream.getVideoTracks ? stream.getVideoTracks() : [];
          const track = tracks[0] || null;
          if (track && typeof track.getCapabilities === 'function' && typeof track.applyConstraints === 'function') {
            const caps = track.getCapabilities();
            const adv = [];
            if (caps.focusMode) adv.push({ focusMode: 'continuous' });
            if (adv.length > 0) {
              await track.applyConstraints({ advanced: adv });
            }
          }
        } catch (e) {
          const m = (e?.message || '').toString();
          if (/setPhotoOptions\s+failed/i.test(m)) return;
          if (/invalid\s+state/i.test(m)) return;
        }
      };
      setTimeout(() => { if (!canceled) tryFocus(); }, 200);
      setTimeout(() => { if (!canceled) tryFocus(); }, 1200);
      setTimeout(() => { if (!canceled) tryFocus(); }, 2400);
      return () => { canceled = true; };
    } else {
      setIsScanning(false);
      setScanningAnimation(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled && isScanning && !lastScannedCode) setNoRecognition(true);
    }, 2500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isOpen, isScanning, lastScannedCode, instanceKey]);

  const handleScan = async (err, result) => {
    if (result && result.text) {
      const now = Date.now();
      // Ignore duplicates of the same code for 2 seconds or while the lock is active
      if (scanLocked || (lastScannedCode === result.text && (now - lastScanTime) < 2000)) {
        return;
      }
      setLastScannedCode(result.text);
      setLastScanTime(now);
      setRecognitionAttempts(0);
      setNoRecognition(false);
      setIsScanning(false);
      setScanningAnimation(false);
      setScanLocked(true);
      setStopStream(true);
      try {
        if (typeof onCheckExists === 'function') {
          let exists = false;
          try {
            exists = !!(await onCheckExists(result.text));
          } catch (_) {
            exists = false;
          }
          if (!exists) {
            setNotFoundCode(result.text);
            setScanLocked(false);
            return;
          }
        }
        if (typeof onScan === 'function') onScan(result.text);
      } finally {
        if (autoCloseOnScan) {
          setTimeout(() => {
            setScanLocked(false);
            try { onClose(); } catch (_) { void 0; }
          }, 250);
        } else {
          setScanLocked(false);
        }
      }
    } else if (err) {
      const raw = (err?.message || (typeof err === 'string' ? err : '') || '').toString();
      const isNotFound = /No\s+MultiFormat\s+Readers\s+were\s+able\s+to\s+detect\s+the\s+code/i.test(raw) || /NotFound/i.test(raw);
      const isPhotoOpts = /setPhotoOptions\s+failed/i.test(raw);
      const isInvalidTrack = /associated\s+Track\s+is\s+in\s+an\s+invalid\s+state/i.test(raw) || /invalid\s+state/i.test(raw);
      if (isNotFound) { setRecognitionAttempts(a => a + 1); return; }
      if (isPhotoOpts || isInvalidTrack) return;
      const now = Date.now();
      if (raw === lastErrorMsg && (now - lastErrorAt) < 3000) return;
      setLastErrorMsg(raw);
      setLastErrorAt(now);
      if (onError) onError(t('scanner.errors.generic', { message: raw || 'Unknown error' }));
    }
  };

  const handleError = (error) => {
    const msg = (error?.message || '').toString();
    if (/setPhotoOptions\s+failed/i.test(msg)) {
      return;
    }
    if (/associated\s+Track\s+is\s+in\s+an\s+invalid\s+state/i.test(msg)) {
      return;
    }
    // Handle different types of errors and their handling
    if (error.name === "NotAllowedError") {
      setHasPermission(false);
      if (onError) {
        onError(t('scanner.errors.permissionDenied'));
      }
    } else if (error.name === "NotFoundError") {
      if (onError) {
        onError(t('scanner.errors.notFound'));
      }
    } else if (error.name === "NotSupportedError") {
      if (onError) {
        onError(t('scanner.errors.notSupported'));
      }
    } else if (error.name === "NotReadableError") {
      if (onError) {
        onError(t('scanner.errors.notReadable'));
      }
    } else if (error.name === "OverconstrainedError") {
      if (onError) {
        onError(t('scanner.errors.overconstrained'));
      }
    } else {
      if (onError) {
        onError(t('scanner.errors.generic', { message: error.message || 'Unknown error' }));
      }
    }
  };

  const handleClose = () => {
    // Stop the stream before closing (workaround for browser freezing issue)
    setStopStream(true);
    setTorchEnabled(false);
    setTimeout(() => {
      onClose();
    }, 100);
  };

  const toggleTorch = () => {
    setTorchEnabled(!torchEnabled);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-lg p-4 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('scanner.title')}
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        {!isSupported ? (
          <div className="text-center py-8">
            <div className="text-red-600 mb-4">
              <ShieldExclamationIcon className="w-16 h-16 mx-auto mb-4" aria-hidden="true" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">
              {t('scanner.browserNotSupported.title')}
            </h4>
            <p className="text-gray-700 mb-4">
              {t('scanner.browserNotSupported.message')}
            </p>
            <div className="text-sm text-gray-600 mb-4">
              <p className="mb-2">{t('scanner.browserNotSupported.tipsTitle')}</p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t('scanner.browserNotSupported.tips.useNewer')}</li>
                <li>{t('scanner.browserNotSupported.tips.switchBrowser')}</li>
                <li>{t('scanner.browserNotSupported.tips.useHttps')}</li>
                <li>{t('scanner.browserNotSupported.tips.enterManually')}</li>
              </ul>
            </div>
            <button
              onClick={handleClose}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              {t('scanner.close')}
            </button>
          </div>
        ) : hasPermission === false ? (
          <div className="text-center py-8">
            <div className="text-red-600 mb-4">
              <LockClosedIcon className="w-16 h-16 mx-auto mb-4" aria-hidden="true" />
            </div>
            <p className="text-gray-700 mb-4">
              {t('scanner.permissionDenied')}
            </p>
            <button
              onClick={handleClose}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              {t('scanner.close')}
            </button>
          </div>
        ) : (
          <div>
            <div className="relative bg-black rounded-lg overflow-hidden mb-4" style={{ height: '300px' }}>
              <div ref={scannerContainerRef} className="w-full h-full">
                <BarcodeScanner
                  key={instanceKey}
                  width="100%"
                  height="100%"
                  onUpdate={handleScan}
                  onError={handleError}
                  facingMode="environment"
                  stopStream={stopStream}
                  torch={torchSupported ? torchEnabled : undefined}
                  formats={SUPPORTED_FORMATS}
                  delay={120}
                  constraints={{
                    video: {
                      facingMode: { ideal: 'environment' },
                      width: { ideal: 1280 },
                      height: { ideal: 720 },
                      frameRate: { ideal: 30, min: 15 }
                    }
                  }}
                />
              </div>
              {/* Scan frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-white border-dashed rounded-lg relative" 
                     style={{ width: '250px', height: '150px' }}>
                  <div className="w-full h-full border-2 border-transparent relative">
                    {/* Rogi ramki */}
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-400"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400"></div>
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-400"></div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-400"></div>
                    {/* Animated scan line */}
                    {scanningAnimation && (
                      <div 
                        className="absolute left-0 right-0 h-0.5 bg-green-400 shadow-lg"
                        style={{
                          animation: 'scan 2s linear infinite',
                          boxShadow: '0 0 10px #4ade80'
                        }}
                      />
                    )}
                  </div>
                  {/* Scanning status */}
                  <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-white text-sm font-medium">
                    {isScanning ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span>{t('scanner.overlay.scanning')}</span>
                      </div>
                    ) : (
                      <span>{t('scanner.overlay.ready')}</span>
                    )}
                    {noRecognition && (
                      <div className="mt-2 text-xs text-yellow-300">
                        <span>{t('scanner.noRecognition.title')}</span>
                        <span className="ml-2">{t('scanner.noRecognition.attempts', { count: recognitionAttempts })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
      {/* Last scanned code */}
      {lastScannedCode && (
        <div className="mb-3 text-center text-sm text-gray-700">
          {t('scanner.lastCode')}: <span className="font-mono">{lastScannedCode}</span>
          {typeof displayQuantity !== 'undefined' && displayQuantity !== null && (
            <span className="ml-2">| {t('scanner.quantity')}: <span className="font-semibold">{displayQuantity}</span></span>
          )}
        </div>
      )}
      {notFoundCode && (
        <div className="mb-3 text-center">
          <div className="text-sm text-red-600 mb-2">{t('scanner.notFound.message', { code: notFoundCode })}</div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                try {
                  if (typeof onAddTool === 'function') onAddTool(notFoundCode);
                  onClose();
                } catch (_) { onClose(); }
              }}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              {t('tools.actions.add')}
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  if (typeof onAddBhp === 'function') onAddBhp(notFoundCode);
                  onClose();
                } catch (_) { onClose(); }
              }}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
            >
              {t('BHP.actions.addEquipment')}
            </button>
          </div>
        </div>
      )}
            <div className="flex justify-between items-center">
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded"
                >
                  <LightBulbIcon className="w-5 h-5" aria-hidden="true" />
                  <span>{torchEnabled ? t('scanner.torch.off') : t('scanner.torch.on')}</span>
                </button>
              )}
              <button
                onClick={handleClose}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
              >
                {t('scanner.buttons.cancel')}
              </button>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <div className="bg-blue-50 border border-blue-200 rounded-lg mb-3">
                <button type="button" onClick={() => setTipsOpen(v => !v)} className="w-full flex items-center justify-between px-3 py-2">
                  <div className="flex items-center">
                    <InformationCircleIcon className="w-5 h-5 text-blue-500 mr-2" aria-hidden="true" />
                    <span className="font-medium text-blue-700">{t('scanner.tips.title')}</span>
                  </div>
                  {tipsOpen ? <ChevronUpIcon className="w-5 h-5 text-blue-500" aria-hidden="true" /> : <ChevronDownIcon className="w-5 h-5 text-blue-500" aria-hidden="true" />}
                </button>
                {tipsOpen && (
                  <div className="px-3 pb-3">
                    <ul className="text-xs text-blue-600 space-y-1">
                      <li>• {t('scanner.tips.holdSteady')}</li>
                      <li>• {t('scanner.tips.wellLit')}</li>
                      <li>• {t('scanner.tips.fillFrame')}</li>
                      <li>• {t('scanner.tips.waitRecognition')}</li>
                    </ul>
                  </div>
                )}
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg">
                <button type="button" onClick={() => setLabelsOpen(v => !v)} className="w-full flex items-center justify-between px-3 py-2">
                  <div className="flex items-center">
                    <LightBulbIcon className="w-5 h-5 text-yellow-600 mr-2" aria-hidden="true" />
                    <span className="font-medium text-yellow-700">{t('scanner.tips.labels.title')}</span>
                  </div>
                  {labelsOpen ? <ChevronUpIcon className="w-5 h-5 text-yellow-600" aria-hidden="true" /> : <ChevronDownIcon className="w-5 h-5 text-yellow-600" aria-hidden="true" />}
                </button>
                {labelsOpen && (
                  <div className="px-3 pb-3">
                    <ul className="text-xs text-yellow-700 space-y-1">
                      <li>• {t('scanner.tips.labels.avoidGlare')}</li>
                      <li>• {t('scanner.tips.labels.closerDistance')}</li>
                      <li>• {t('scanner.tips.labels.useTorch')}</li>
                      <li>• {t('scanner.tips.labels.waitSeconds')}</li>
                      <li>• {t('scanner.tips.labels.checkSticker')}</li>
                    </ul>
                    <p className="text-xs text-yellow-700 mt-2">{t('scanner.tips.finalInstruction')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BarcodeScannerComponent;
