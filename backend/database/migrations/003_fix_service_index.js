const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    const createIndex = (sql, name) => {
      return new Promise((resolve, reject) => {
        db.run(sql, (err) => {
          if (err) {
            logger.error(`Error creating index ${name}:`, { error: err.message });
            resolve();
          } else {
            logger.info(`Index ${name} created`);
            resolve();
          }
        });
      });
    };

    try {
      // Fix Tool Service History index (use created_at instead of service_date)
      await createIndex('CREATE INDEX IF NOT EXISTS idx_tool_service_history_date ON tool_service_history(created_at)', 'idx_tool_service_history_date');

      logger.info('Fix Service Index migration completed');
    } catch (error) {
      logger.error('Migration failed:', { error: error.message });
      throw error;
    }
  }
};
