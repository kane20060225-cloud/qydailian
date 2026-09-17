'use strict';
const {READ_MODEL_SQL} = require('./order-center');
// Cohort: orders created in the last 90 days. Durations require actual audit boundaries.
const METRICS_SQL = `SELECT
 COUNT(*) AS orders_count,
 COUNT(DISTINCT CASE WHEN c.payment_status='paid' THEN c.customer_id END) AS paying_customers,
 COUNT(DISTINCT CASE WHEN c.payment_status='paid' AND repeaters.customer_id IS NOT NULL THEN c.customer_id END) AS repeat_customers,
 COUNT(CASE WHEN c.order_type='rental' AND c.payment_status='paid' THEN 1 END) AS paid_rentals,
 COUNT(CASE WHEN c.order_type='rental' AND c.payment_status='paid' AND rw.disputed_at IS NOT NULL THEN 1 END) AS disputed_rentals,
 COUNT(CASE WHEN c.order_type='boost' AND timing.taken_at>=timing.paid_at THEN 1 END) AS assignment_samples,
 AVG(CASE WHEN c.order_type='boost' AND timing.taken_at>=timing.paid_at THEN TIMESTAMPDIFF(SECOND,timing.paid_at,timing.taken_at)/3600 END) AS assignment_hours,
 COUNT(CASE WHEN c.order_type='boost' AND timing.completed_at>=timing.taken_at THEN 1 END) AS completion_samples,
 AVG(CASE WHEN c.order_type='boost' AND timing.completed_at>=timing.taken_at THEN TIMESTAMPDIFF(SECOND,timing.taken_at,timing.completed_at)/3600 END) AS completion_hours
 FROM (${READ_MODEL_SQL}) c
 LEFT JOIN rental_order_workflow rw ON c.order_type='rental' AND rw.order_no=c.order_ref
 LEFT JOIN (SELECT target_ref,
 MIN(CASE WHEN action IN ('manual_payment_confirmed','manual_payment_confirmed_without_evidence','payment_confirmed') THEN created_at END) AS paid_at,
 MIN(CASE WHEN action='order_taken' THEN created_at END) AS taken_at,
 MAX(CASE WHEN action='order_completed' THEN created_at END) AS completed_at
 FROM operation_audit WHERE target_type='order' GROUP BY target_ref) timing ON c.order_type='boost' AND timing.target_ref=c.order_ref
 LEFT JOIN (SELECT customer_id FROM (${READ_MODEL_SQL}) repeat_orders
 WHERE created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY) AND payment_status='paid' AND test_order=0 AND order_type IN ('boost','rental')
 GROUP BY customer_id HAVING COUNT(*)>=2) repeaters ON repeaters.customer_id=c.customer_id
 WHERE c.created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY) AND c.test_order=0 AND c.order_type IN ('boost','rental')`;
function decorateMetrics(row) {
  const rate = (numerator,denominator) => Number(denominator)>0 ? Number((Number(numerator)/Number(denominator)*100).toFixed(1)) : null;
  const hours = value => value == null ? null : Number(Number(value).toFixed(2));
  return {period_days:90,orders_count:Number(row.orders_count || 0),assignment_hours:hours(row.assignment_hours),assignment_samples:Number(row.assignment_samples || 0),completion_hours:hours(row.completion_hours),completion_samples:Number(row.completion_samples || 0),dispute_rate:rate(row.disputed_rentals,row.paid_rentals),disputed_rentals:Number(row.disputed_rentals || 0),paid_rentals:Number(row.paid_rentals || 0),repeat_rate:rate(row.repeat_customers,row.paying_customers),repeat_customers:Number(row.repeat_customers || 0),paying_customers:Number(row.paying_customers || 0)};
}
module.exports = {METRICS_SQL,decorateMetrics};
