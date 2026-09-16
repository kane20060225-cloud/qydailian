# Order cleanup

Run `node scripts/migrate-b11-order-cleanup.js --plan`, then
`node scripts/migrate-b11-order-cleanup.js --apply --confirm=B11-ORDER-CLEANUP-ADDITIVE-MIGRATION`
after backing up the site and database. The migration creates two metadata tables only.

Administrators can delete individual or up to 25 selected orders from Order Center and restore them from Trash. Deletion changes visibility in Order Center and the boost, rental and third-party order lists; original business, financial, evidence and payment callback records remain intact. Ongoing execution, payment review and exceptions cannot be deleted. Unpaid rental orders must first be cancelled. Payment or business state changes invalidate the removal snapshot and make the order visible again.

Automatic cleanup is off initially. Administrators preview and save a retention period of 7–90 days. The server checks hourly and processes at most 200 orders per pass. Only unassigned unpaid boosts, unpaid cancelled rentals, provider-confirmed closed recharge orders and unpaid rejected third-party orders qualify. Financial ledger entries or payment evidence exclude an order. Each candidate is locked and checked again before removal; audit and visibility changes commit together. No arbitrary existing production orders are removed during deployment.

Rollback: disable automatic cleanup first; restore records using Trash if needed. Restore the previous application backup while leaving the two additive tables in place. Never delete payment records or account ledger entries as part of rollback.
