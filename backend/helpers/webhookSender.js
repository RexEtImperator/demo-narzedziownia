const crypto = require('crypto');
const db = require('../database/db');
const logger = require('../logger');

const triggerWebhooks = async (event, payload) => {
  try {
    // Fetch active webhooks for this event
    const webhooks = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM webhooks WHERE active = 1', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (!webhooks || webhooks.length === 0) return;

    const matchedWebhooks = webhooks.filter(wh => {
      try {
        const events = JSON.parse(wh.events || '[]');
        return events.includes(event) || events.includes('*');
      } catch (e) {
        return false;
      }
    });

    if (matchedWebhooks.length === 0) return;

    logger.info(`Triggering webhooks for event: ${event}`, { count: matchedWebhooks.length });

    // Send to all matched webhooks
    matchedWebhooks.forEach(async (webhook) => {
      const startTime = Date.now();
      try {
        const body = JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          payload
        });

        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'ToolManagementSystem-Webhook/1.0'
        };

        if (webhook.secret) {
          const signature = crypto
            .createHmac('sha256', webhook.secret)
            .update(body)
            .digest('hex');
          headers['X-Hub-Signature-256'] = `sha256=${signature}`;
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body
        });

        const duration = Date.now() - startTime;
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch (_) {}

        // Log result
        db.run(
          'INSERT INTO webhook_logs (webhook_id, event, status_code, response_body, duration_ms) VALUES (?, ?, ?, ?, ?)',
          [webhook.id, event, response.status, responseBody.substring(0, 1000), duration]
        );

      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`Webhook delivery failed for ${webhook.url}`, { error: error.message });
        
        db.run(
          'INSERT INTO webhook_logs (webhook_id, event, status_code, response_body, duration_ms) VALUES (?, ?, ?, ?, ?)',
          [webhook.id, event, 0, error.message, duration]
        );
      }
    });

  } catch (err) {
    logger.error('Error triggering webhooks', { error: err.message });
  }
};

module.exports = { triggerWebhooks };
