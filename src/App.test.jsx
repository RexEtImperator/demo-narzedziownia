import React from 'react';
import ReactDOM from 'react-dom/client';
// Zmockuj problematyczny moduł ESM używany w BarcodeScanner, aby uniknąć błędu transformacji w środowisku testowym
vi.mock('react-qr-barcode-scanner', () => () => null);
import App from './App.jsx';

// Minimalny test smoke: renderuje App i zwalnia zasoby
test('renders App without crashing', () => {
  const container = document.createElement('div');
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
  root.unmount();
});
