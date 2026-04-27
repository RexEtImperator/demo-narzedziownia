import api from '../api';

class ErrorTracker {
  constructor() {
    this.errors = [];
  }

  capture(error, context = {}) {
    if (!error) return;
    const entry = {
      message: String(error?.message || error),
      stack: String(error?.stack || ''),
      context,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    };
    this.errors.push(entry);
    if (this.errors.length >= 10) {
      this.flush();
    }
  }

  async flush() {
    if (!this.errors.length) return;
    const batch = [...this.errors];
    this.errors = [];
    try {
      await api.post('/api/client-errors', { errors: batch });
    } catch (e) {
      // If sending fails, re-queue errors to avoid losing them
      this.errors = batch.concat(this.errors);
      console.error('Failed to send error logs:', e);
    }
  }
}

export const errorTracker = new ErrorTracker();

