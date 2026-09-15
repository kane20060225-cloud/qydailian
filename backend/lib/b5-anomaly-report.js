'use strict';

const REPORT_QUERIES = Object.freeze({
  orphan_booster_references: `SELECT COUNT(*) AS count FROM orders o
    LEFT JOIN users b ON o.booster_id = b.id
    WHERE o.booster_id IS NOT NULL AND b.id IS NULL`,
  duplicate_open_rental_accounts: `SELECT COUNT(*) AS count FROM (
    SELECT account_id FROM rental_orders
    WHERE status IN ('pending','active')
    GROUP BY account_id HAVING COUNT(*) > 1
  ) AS duplicate_accounts`,
  cancelled_rentals_with_credits: `SELECT COUNT(*) AS count FROM rental_orders
    WHERE status = 'cancelled' AND credits_used > 0`,
  third_party_ready_for_manual_finalization: `SELECT COUNT(*) AS count FROM third_party_orders
    WHERE status = 'approved' AND payment_status = 'paid' AND complete_requested = 1`,
  manual_order_screenshots: `SELECT COUNT(*) AS count FROM orders
    WHERE payment_screenshot IS NOT NULL`,
  user_delete_cascade_constraints: `SELECT COUNT(*) AS count FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE() AND referenced_table_name = 'users'
      AND delete_rule = 'CASCADE'`
});

async function b5AnomalyReport(conn) {
  const report = {};
  for (const [label, query] of Object.entries(REPORT_QUERIES)) {
    const [rows] = await conn.execute(query);
    report[label] = Number(rows[0].count);
  }
  return report;
}

module.exports = { REPORT_QUERIES, b5AnomalyReport };
