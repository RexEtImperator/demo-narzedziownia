const logger = require('../../logger');

module.exports = {
  up: async (db) => {
    const createIndex = (sql, name) => {
      return new Promise((resolve, reject) => {
        db.run(sql, (err) => {
          if (err) {
            logger.error(`Error creating index ${name}:`, { error: err.message });
            // Don't reject if index already exists
            resolve();
          } else {
            logger.info(`Index ${name} created`);
            resolve();
          }
        });
      });
    };

    try {
      // System Logs indexes
      await createIndex('CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)', 'idx_system_logs_level');
      await createIndex('CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category)', 'idx_system_logs_category');
      await createIndex('CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at)', 'idx_system_logs_created_at');

      // Tool Service History indexes
      await createIndex('CREATE INDEX IF NOT EXISTS idx_tool_service_history_tool_id ON tool_service_history(tool_id)', 'idx_tool_service_history_tool_id');
      await createIndex('CREATE INDEX IF NOT EXISTS idx_tool_service_history_date ON tool_service_history(service_date)', 'idx_tool_service_history_date');

      // Tools indexes
      await createIndex('CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name)', 'idx_tools_name');

      logger.info('Performance indexes migration completed');
    } catch (error) {
      logger.error('Migration failed:', { error: error.message });
      throw error;
    }
  }
};
