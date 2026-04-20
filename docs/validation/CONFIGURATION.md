# Validation Configuration

Main config file:

`src/server/validation/config/validationConfig.ts`

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VALIDATION_DATABASE_URL` | `DATABASE_URL` | Separate validation MongoDB connection URI. |
| `VALIDATION_READ_PREFERENCE` | `secondaryPreferred` | Prefer secondary reads when available. |
| `VALIDATION_DB_TIMEOUT_MS` | `10000` | Mongo server selection timeout. |
| `VALIDATION_TENANT_FIELD` | `tenantId` | Tenant field used for filtering. |
| `VALIDATION_INCLUDE_UNTENANTED` | `true` | Include legacy records without tenant IDs. |
| `VALIDATION_TOLERANCE` | `0.5` | General rupee tolerance for validations. |
| `VALIDATION_ROUND_OFF_TOLERANCE` | `1` | Maximum difference treated as round-off. |
| `VALIDATION_CRON_ENABLED` | `true` | Enables nightly scheduler. |
| `VALIDATION_CRON_SCHEDULE` | `0 2 * * *` | Cron expression for scheduled validation. |
| `VALIDATION_CRON_TIMEZONE` | `Asia/Kolkata` | Scheduler timezone. |
| `VALIDATION_CRON_TENANT_ID` | empty | Optional tenant ID for scheduled system runs. |
| `VALIDATION_ALERT_EMAILS` | `SMTP_TO_RECIPIENTS` | Critical alert recipients. |
| `VALIDATION_SLACK_WEBHOOK_URL` | empty | Slack incoming webhook for critical alerts. |

## Collection Mapping

The module reads existing collections using names configured under `collections`.

Validation-owned collections:

- `validation_reports`
- `validation_issue_feedback`
- `validation_settings`

Existing accounting collections are read-only.

## Field Mapping

Fields are grouped by entity:

- `ledger`
- `chartAccount`
- `journalEntry`
- `journalLine`
- `tdsTransaction`
- `tdsChallan`
- `financialPeriod`
- `fixedAsset`

If existing schema names change, update only this config file and rerun validations.

## Sequence Checks

`sequences` controls missing-number checks.

Example:

```ts
{
  checkName: 'Invoice Sequence',
  collection: 'accountingInvoices',
  field: 'invoiceNumber',
  dateField: 'invoiceDate',
}
```

## Operational Notes

- The module uses a separate Mongoose connection from the main app.
- Reads use `secondaryPreferred` by default.
- Writes are limited to validation-owned collections.
- The scheduler registers at server startup.
- UI-saved validation settings are stored in `validation_settings`; environment variables remain the startup fallback.

