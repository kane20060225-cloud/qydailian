# Order cleanup

Run `node scripts/migrate-b11-order-cleanup.js --plan`, then
`node scripts/migrate-b11-order-cleanup.js --apply --confirm=B11-ORDER-CLEANUP-ADDITIVE-MIGRATION`
after backing up the site and database. The migration creates two metadata tables only.

Administrators can delete individual or up to 25 selected orders from Order Center and restore them from Trash. Deletion changes visibility in Order Center and the boost, rental and third-party order lists; original business, financial, evidence and payment callback records remain intact. Ongoing execution, payment review and exceptions cannot be deleted. Unpaid rental orders must first be cancelled. Payment or business state changes invalidate the removal snapshot and make the order visible again.

Automatic cleanup is off initially. Administrators preview and save a retention period of 7–90 days. The server checks hourly and processes at most 200 orders per pass. Only unassigned unpaid boosts, unpaid cancelled rentals, provider-confirmed closed recharge orders and unpaid rejected third-party orders qualify. Financial ledger entries or payment evidence exclude an order. Each candidate is locked and checked again before removal; audit and visibility changes commit together. No arbitrary existing production orders are removed during deployment.

## Trash expiry (14 days)

The hourly service also permanently deletes eligible orders after 14 full days **in Trash**, independently of the invalid-order cleanup toggle. Each order's source row and removal row are locked, expiry and state snapshots checked again, and payment/ledger/evidence/assignment/refund/completion records checked before deleting the source and its nonfinancial metadata. An immutable `order_permanently_deleted` audit event commits in the same transaction. Recently removed, restored or changed orders do not qualify. A restored order moved to Trash again starts a fresh 14-day period.

Paid orders, ledger entries, payment evidence, unresolved or completed payment/fulfilment metadata and recharge orders with an unconfirmed provider state are protected and remain restorable. Only unpaid boosts without assignments, unpaid pending/rejected third-party orders, unfinanced cancelled rentals and confirmed closed recharge orders without transaction records can be physically purged. The UI explains this policy and displays the deadline; expiry is checked hourly, at most 200 orders per pass. This policy is active by default as explicitly requested; it is separate from the optional invalid-order cleanup rule.

Rollback: restore the previous application backup to stop the expiry worker, while leaving the two additive tables in place. Disable invalid-order cleanup first and restore remaining Trash records if needed. Already purged source rows cannot be restored through the UI; recovery requires the private predeployment database backup. Never delete financial ledgers or payment evidence as part of rollback.
