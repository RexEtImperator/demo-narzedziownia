const up = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TRIGGER IF NOT EXISTS trg_tools_slings_issues_after_insert
         AFTER INSERT ON tools_slings_issues
         BEGIN
           UPDATE tools_slings_items
           SET
             status = CASE
               WHEN NEW.status = 'issued' THEN 'issued'
               WHEN NEW.status = 'returned' THEN 'available'
               ELSE status
             END,
             employee_id = CASE
               WHEN NEW.status = 'issued' THEN NEW.employee_id
               WHEN NEW.status = 'returned' THEN NULL
               ELSE employee_id
             END,
             issued_at = CASE
               WHEN NEW.status = 'issued' THEN COALESCE(NEW.created_at, datetime('now'))
               ELSE issued_at
             END,
             returned_at = CASE
               WHEN NEW.status = 'issued' THEN NULL
               WHEN NEW.status = 'returned' THEN COALESCE(NEW.returned_at, NEW.created_at, datetime('now'))
               ELSE returned_at
             END
           WHERE id = NEW.item_id;
         END`
      );

      db.run(
        `UPDATE tools_slings_items
         SET
           status = 'issued',
           employee_id = (
             SELECT li.employee_id
             FROM tools_slings_issues li
             WHERE li.id = (SELECT MAX(id) FROM tools_slings_issues WHERE item_id = tools_slings_items.id)
           ),
           issued_at = COALESCE(
             (
               SELECT li.created_at
               FROM tools_slings_issues li
               WHERE li.id = (SELECT MAX(id) FROM tools_slings_issues WHERE item_id = tools_slings_items.id)
             ),
             issued_at
           ),
           returned_at = NULL
         WHERE (
           SELECT li.status
           FROM tools_slings_issues li
           WHERE li.id = (SELECT MAX(id) FROM tools_slings_issues WHERE item_id = tools_slings_items.id)
         ) = 'issued'`
      );

      db.run(
        `UPDATE tools_slings_items
         SET
           status = 'available',
           employee_id = NULL,
           returned_at = COALESCE(
             (
               SELECT COALESCE(li.returned_at, li.created_at)
               FROM tools_slings_issues li
               WHERE li.id = (SELECT MAX(id) FROM tools_slings_issues WHERE item_id = tools_slings_items.id)
             ),
             returned_at
           )
         WHERE (
           SELECT li.status
           FROM tools_slings_issues li
           WHERE li.id = (SELECT MAX(id) FROM tools_slings_issues WHERE item_id = tools_slings_items.id)
         ) = 'returned'`
      );

      db.run(
        `UPDATE tools
         SET status = (
           CASE
             WHEN (SELECT COUNT(*) FROM tools_slings_items i WHERE i.tool_id = tools.id) = 0 THEN status
             WHEN (SELECT COUNT(*) FROM tools_slings_items i WHERE i.tool_id = tools.id AND i.status = 'issued') = 0 THEN 'available'
             WHEN (SELECT COUNT(*) FROM tools_slings_items i WHERE i.tool_id = tools.id AND i.status = 'issued')
                  < (SELECT COUNT(*) FROM tools_slings_items i WHERE i.tool_id = tools.id) THEN 'partially_issued'
             ELSE 'issued'
           END
         )
         WHERE id IN (SELECT DISTINCT tool_id FROM tools_slings_items)`,
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  });
};

const down = async (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DROP TRIGGER IF EXISTS trg_tools_slings_issues_after_insert', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

module.exports = { up, down };
