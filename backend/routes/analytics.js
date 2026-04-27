const express = require('express');
const router = express.Router();
const db = require('../database/db');
const logger = require('../logger');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { sendDomainError } = require('../helpers/errorHelper');

// Service History Summary for Analytics
router.get('/service-history/summary', authenticateToken, (req, res) => {
  const inServiceQuery = `
    SELECT id, name, sku, COALESCE(service_quantity,0) as service_quantity, service_order_number, service_sent_at
    FROM tools
    WHERE COALESCE(service_quantity,0) > 0
    ORDER BY service_sent_at DESC
  `;
  const recentEventsQuery = `
    SELECT h.id, h.tool_id, t.name, t.sku, h.action, h.quantity, h.order_number, h.created_at
    FROM tool_service_history h
    JOIN tools t ON t.id = h.tool_id
    ORDER BY h.created_at DESC
    LIMIT 50
  `;

  db.all(inServiceQuery, [], (err, inService) => {
    if (err) {
      return res.status(500).json({ message: 'Server error' });
    }
    db.all(recentEventsQuery, [], (err2, events) => {
      if (err2) {
        return res.status(500).json({ message: 'Server error' });
      }
      res.json({ in_service: inService, recent_events: events });
    });
  });
});

// Analytics Endpoint (Aggregated Stats)
/**
 * @swagger
 * /analytics:
 *   get:
 *     summary: Get analytics data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics data
 *       500:
 *         description: Server error
 */
router.get('/analytics', authenticateToken, requirePermission('VIEW_ANALYTICS'), async (req, res) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const next30DaysDate = new Date(now);
  next30DaysDate.setDate(now.getDate() + 30);
  const next30Days = next30DaysDate.toISOString().split('T')[0];
  
  const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
  const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

  try {
    // Tools stats (Inspections)
    const toolsQuery = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN inspection_date < ? THEN 1 ELSE 0 END) as overdue,
            SUM(CASE WHEN inspection_date >= ? AND inspection_date <= ? THEN 1 ELSE 0 END) as upcoming
        FROM tools
        WHERE inspection_date IS NOT NULL
    `;
    
    // BHP stats (Inspections)
    const bhpQuery = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN inspection_date < ? THEN 1 ELSE 0 END) as overdue,
            SUM(CASE WHEN inspection_date >= ? AND inspection_date <= ? THEN 1 ELSE 0 END) as upcoming
        FROM bhp
        WHERE inspection_date IS NOT NULL
    `;
    
    // Top 10 Overdue Tools
    const overdueToolsQuery = `
        SELECT id, name, sku, inspection_date 
        FROM tools 
        WHERE inspection_date < ? 
        ORDER BY inspection_date ASC 
        LIMIT 10
    `;

    // Top 10 Overdue BHP
    const overdueBhpQuery = `
        SELECT id, inventory_number, model, inspection_date 
        FROM bhp 
        WHERE inspection_date < ? 
        ORDER BY inspection_date ASC 
        LIMIT 10
    `;
    
    // Utilization & Other Stats
    const toolsUtilQuery = `
      SELECT 
        (SELECT SUM(quantity) FROM tools) as total, 
        (SELECT SUM(quantity) FROM tool_issues WHERE status = 'wydane') as issued,
        (SELECT SUM(service_quantity) FROM tools) as in_service
    `;
    const bhpTotalQuery = `SELECT COUNT(*) as total FROM bhp`;
    const bhpIssuedQuery = `SELECT COUNT(*) as issued FROM bhp_issues WHERE status = 'wydane'`;
    const empStatsQuery = `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM employees`;
    const deptStatsQuery = `SELECT d.name, COUNT(e.id) as count FROM departments d LEFT JOIN employees e ON e.department = d.name GROUP BY d.id ORDER BY count DESC`;

    // New: Top 5 Employees by Active Tools
    const topEmployeesToolsQuery = `
        SELECT e.id, e.first_name, e.last_name, COUNT(ti.id) as active_count
        FROM employees e
        JOIN tool_issues ti ON e.id = ti.employee_id
        WHERE ti.returned_at IS NULL
        GROUP BY e.id
        ORDER BY active_count DESC
        LIMIT 5
    `;

    // New: Most Popular Tools (Lifetime usage)
    const popularToolsQuery = `
        SELECT t.id, t.name, t.sku, COUNT(ti.id) as usage_count
        FROM tools t
        JOIN tool_issues ti ON t.id = ti.tool_id
        GROUP BY t.id
        ORDER BY usage_count DESC
        LIMIT 5
    `;

    // New: Usage Trends (Last 30 days)
    const usageTrendsQuery = `
        SELECT date(issued_at) as date, COUNT(*) as count
        FROM tool_issues
        WHERE issued_at >= date('now', '-30 days')
        GROUP BY date(issued_at)
        ORDER BY date(issued_at) ASC
    `;

    // New: Tools by Category
    const categoryStatsQuery = `
        SELECT category, COUNT(*) as count
        FROM tools
        GROUP BY category
        HAVING count > 0
        ORDER BY count DESC
    `;

    const [
      toolsStats, overdueTools, 
      bhpStats, overdueBhp,
      toolsUtil, bhpTotal, bhpIssued,
      empStats, deptStats,
      topEmployeesTools, popularTools,
      usageTrends, categoryStats
    ] = await Promise.all([
      dbGet(toolsQuery, [today, today, next30Days]),
      dbAll(overdueToolsQuery, [today]),
      dbGet(bhpQuery, [today, today, next30Days]),
      dbAll(overdueBhpQuery, [today]),
      dbGet(toolsUtilQuery),
      dbGet(bhpTotalQuery),
      dbGet(bhpIssuedQuery),
      dbGet(empStatsQuery),
      dbAll(deptStatsQuery),
      dbAll(topEmployeesToolsQuery),
      dbAll(popularToolsQuery),
      dbAll(usageTrendsQuery),
      dbAll(categoryStatsQuery)
    ]);

    res.json({
      tools: { 
        stats: toolsStats, 
        overdue_list: overdueTools,
        utilization: {
          total: toolsUtil?.total || 0,
          in_service: toolsUtil?.in_service || 0,
          issued: toolsUtil?.issued || 0
        },
        popular: popularTools,
        categories: categoryStats
      },
      bhp: { 
        stats: bhpStats, 
        overdue_list: overdueBhp,
        utilization: {
          total: bhpTotal?.total || 0,
          issued: bhpIssued?.issued || 0
        }
      },
      employees: {
        total: empStats?.total || 0,
        active: empStats?.active || 0,
        top_active_tools: topEmployeesTools
      },
      departments: deptStats || [],
      trends: usageTrends || []
    });

  } catch (error) {
    logger.error('Error fetching analytics:', error);
    sendDomainError(res, error);
  }
});

/**
 * @swagger
 * /analytics/export:
 *   get:
 *     summary: Export analytics data to CSV
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/export', authenticateToken, requirePermission('VIEW_ANALYTICS'), async (req, res) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

  try {
    // Gather data for export
    const toolsStats = await dbAll(`
      SELECT 'Tool' as type, name, sku as identifier, quantity as total_quantity, 
             available_quantity, COALESCE(service_quantity, 0) as service_quantity,
             inspection_date,
             CASE 
               WHEN inspection_date < ? THEN 'Overdue'
               WHEN inspection_date >= ? AND inspection_date <= date(?, '+30 days') THEN 'Upcoming'
               ELSE 'OK'
             END as inspection_status
      FROM tools
    `, [today, today, today]);

    const bhpStats = await dbAll(`
      SELECT 'BHP' as type, model as name, inventory_number as identifier, 1 as total_quantity,
             CASE WHEN status = 'available' THEN 1 ELSE 0 END as available_quantity, 
             0 as service_quantity,
             inspection_date,
             CASE 
               WHEN inspection_date < ? THEN 'Overdue'
               WHEN inspection_date >= ? AND inspection_date <= date(?, '+30 days') THEN 'Upcoming'
               ELSE 'OK'
             END as inspection_status
      FROM bhp
    `, [today, today, today]);

    const allItems = [...toolsStats, ...bhpStats];

    // Convert to CSV
    const header = ['Type', 'Name', 'Identifier', 'Total Qty', 'Available Qty', 'Service Qty', 'Inspection Date', 'Inspection Status'];
    const rows = allItems.map(item => [
      item.type,
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.identifier || '').replace(/"/g, '""')}"`,
      item.total_quantity,
      item.available_quantity,
      item.service_quantity,
      item.inspection_date || '',
      item.inspection_status
    ]);

    const csvContent = [
      header.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_export_${today}.csv`);
    res.send(csvContent);

  } catch (error) {
    logger.error('Error exporting analytics:', error);
    sendDomainError(res, error);
  }
});

module.exports = router;
