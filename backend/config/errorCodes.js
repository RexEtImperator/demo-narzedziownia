const ERROR_CODES = {
  // Inventory (continued)
  INVENTORY_SESSION_INVALID_ACTION: { status: 400, key: 'inventory.errors.invalidAction', fallback: 'Invalid action' },
  INVENTORY_SESSION_FETCH_FAILED: { status: 500, key: 'inventory.errors.fetchSessionFailed', fallback: 'Error fetching session' },
  INVENTORY_SESSION_NOT_FOUND: { status: 404, key: 'inventory.errors.sessionNotFound', fallback: 'Session does not exist' },
  INVENTORY_SESSION_STATUS_INVALID: { status: 400, key: 'inventory.errors.sessionStatusInvalid', fallback: 'Session status is invalid' },
  INVENTORY_DELETE_COUNTS_FAILED: { status: 500, key: 'inventory.errors.deleteCountsFailed', fallback: 'Error deleting counts' },
  INVENTORY_DELETE_CORRECTIONS_FAILED: { status: 500, key: 'inventory.errors.deleteCorrectionsFailed', fallback: 'Error deleting corrections' },
  INVENTORY_DELETE_SESSION_FAILED: { status: 500, key: 'inventory.errors.deleteSessionFailed', fallback: 'Error deleting session' },
  INVENTORY_CODE_REQUIRED: { status: 400, key: 'inventory.errors.codeRequired', fallback: 'Code is required' },
  INVENTORY_TOOL_NOT_FOUND: { status: 404, key: 'inventory.errors.toolNotFound', fallback: 'No tool found for the provided code' },
  INVENTORY_COUNT_GET_FAILED: { status: 500, key: 'inventory.errors.countFetchFailed', fallback: 'Error fetching count' },
  INVENTORY_COUNT_SET_FAILED: { status: 500, key: 'inventory.errors.countSetFailed', fallback: 'Error setting count' },
  INVENTORY_REQUIRED_FIELDS: { status: 400, key: 'inventory.errors.requiredFields', fallback: 'Required fields missing' },
  INVENTORY_CORRECTION_NOT_FOUND: { status: 404, key: 'inventory.errors.correctionNotFound', fallback: 'Correction not found' },
  INVENTORY_CORRECTION_ALREADY_APPROVED: { status: 400, key: 'inventory.errors.correctionAlreadyApproved', fallback: 'Cannot delete an approved correction' },
  INVENTORY_CORRECTION_APPLY_FAILED: { status: 500, key: 'inventory.errors.correctionApplyFailed', fallback: 'Error applying correction' },

  // Notifications
  NOTIFICATIONS_INVALID_TYPE: { status: 400, key: 'notifications.errors.invalidType', fallback: 'Invalid type' },
  NOTIFICATIONS_INVALID_ITEM_TYPE: { status: 400, key: 'notifications.errors.invalidItemType', fallback: 'Invalid item_type' },
  NOTIFICATIONS_MISSING_FILTERS: { status: 400, key: 'notifications.errors.missingFilters', fallback: 'Missing filters' },
  NOTIFICATIONS_DELETE_FAILED: { status: 500, key: 'notifications.errors.deleteFailed', fallback: 'Error deleting notifications' },
  NOTIFICATIONS_BULK_DELETE_MISSING_IDS: { status: 400, key: 'notifications.errors.missingIds', fallback: 'Missing ids' },
  NOTIFICATIONS_HISTORY_INVALID_TYPE: { status: 400, key: 'notifications.errors.historyInvalidType', fallback: 'Invalid type' },
  NOTIFICATIONS_INVALID_ID: { status: 400, key: 'notifications.errors.invalidId', fallback: 'Invalid notification ID' },
  NOTIFICATIONS_NOT_FOUND: { status: 404, key: 'notifications.errors.notFound', fallback: 'Notification not found' },
  NOTIFICATIONS_SUBSCRIBE_INVALID: { status: 400, key: 'notifications.errors.subscribeInvalid', fallback: 'Invalid subscription' },
  NOTIFICATIONS_PUSH_CONFIG_FAILED: { status: 500, key: 'notifications.errors.pushConfigFailed', fallback: 'Push configuration failed' },

  // Audit
  AUDIT_FETCH_FAILED: { status: 500, key: 'auditLog.errors.fetchFailed', fallback: 'Failed to fetch audit logs' },
  AUDIT_WRITE_FAILED: { status: 500, key: 'auditLog.errors.writeFailed', fallback: 'Failed to write audit log' }
};

module.exports = { ERROR_CODES };
