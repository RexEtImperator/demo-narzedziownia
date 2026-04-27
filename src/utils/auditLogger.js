import api from '../api';

export const addAuditLog = async (user, action, details) => {
  // If the user is null (e.g. after an invalid token), skip login
  if (!user || user.id == null) {
    return;
  }
  try {
    await api.post('/api/audit', {
      user_id: user.id,
      username: user.username,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error adding audit log:', error);
  }
};
