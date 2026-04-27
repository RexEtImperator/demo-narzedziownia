import React from 'react';
import { toast } from 'react-toastify';
import Toast from '../components/common/Toast';

const defaultOptions = {
  autoClose: 3000,
  hideProgressBar: true,
  closeButton: false,
  className: '!p-0 !shadow-none',
  bodyClassName: '!p-0 !m-0',
};

export function notifyError(tOrMessage, maybeKey, params) {
  try {
    let msg;
    if (typeof tOrMessage === 'function') {
      msg = tOrMessage(maybeKey, params);
    } else {
      msg = String(tOrMessage ?? '');
    }
    toast(
      ({ closeToast, toastProps }) => (
        <Toast
          type="error" 
          title="Błąd" 
          message={msg} 
          closeToast={closeToast} 
          toastProps={toastProps} 
        />
      ),
      { ...defaultOptions, autoClose: 4000 }
    );
  } catch (_) {
    toast(
      ({ closeToast, toastProps }) => (
        <Toast 
          type="error" 
          title="Błąd" 
          message={String(maybeKey || tOrMessage || 'Error')} 
          closeToast={closeToast} 
          toastProps={toastProps} 
        />
      ), 
      { ...defaultOptions, autoClose: 4000 }
    );
  }
}

export function notifySuccess(tOrMessage, maybeKey, params) {
  try {
    let msg;
    if (typeof tOrMessage === 'function') {
      msg = tOrMessage(maybeKey, params);
    } else {
      msg = String(tOrMessage ?? '');
    }
    toast(
      ({ closeToast, toastProps }) => (
        <Toast 
          type="success" 
          title="Sukces" 
          message={msg} 
          closeToast={closeToast} 
          toastProps={toastProps} 
        />
      ), 
      { ...defaultOptions, autoClose: 2000 }
    );
  } catch (_) {
    toast(
      ({ closeToast, toastProps }) => (
        <Toast 
          type="success" 
          title="Sukces" 
          message={String(maybeKey || tOrMessage || 'OK')} 
          closeToast={closeToast} 
          toastProps={toastProps} 
        />
      ), 
      { ...defaultOptions, autoClose: 2000 }
    );
  }
}

export function notifyInfo(tOrMessage, maybeKey, params) {
  try {
    let msg;
    if (typeof tOrMessage === 'function') {
      msg = tOrMessage(maybeKey, params);
    } else {
      msg = String(tOrMessage ?? '');
    }
    toast(
      ({ closeToast, toastProps }) => (
        <Toast 
          type="info" 
          title="Info" 
          message={msg} 
          closeToast={closeToast} 
          toastProps={toastProps} 
        />
      ), 
      defaultOptions
    );
  } catch (_) {
    toast(
      ({ closeToast, toastProps }) => (
        <Toast 
          type="info" 
          title="Info" 
          message={String(maybeKey || tOrMessage || 'Info')} 
          closeToast={closeToast} 
          toastProps={toastProps} 
        />
      ), 
      defaultOptions
    );
  }
}

export function notifyWarn(tOrMessage, maybeKey, params) {
  try {
    let msg;
    if (typeof tOrMessage === 'function') {
      msg = tOrMessage(maybeKey, params);
    } else {
      msg = String(tOrMessage ?? '');
    }
    toast(
      ({ closeToast, toastProps }) => (
        <Toast 
          type="warning" 
          title="Uwaga" 
          message={msg} 
          closeToast={closeToast} 
          toastProps={toastProps} 
        />
      ), 
      { ...defaultOptions, autoClose: 4000 }
    );
  } catch (_) {
    toast(
      ({ closeToast, toastProps }) => (
        <Toast 
          type="warning" 
          title="Uwaga" 
          message={String(maybeKey || tOrMessage || 'Warning')} 
          closeToast={closeToast} 
          toastProps={toastProps} 
        />
      ), 
      { ...defaultOptions, autoClose: 4000 }
    );
  }
}