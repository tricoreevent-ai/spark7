# Validation API Reference

Base path: `/api/validate`

All endpoints require normal application auth and accounting page access.

## POST `/run`

Triggers an asynchronous validation run.

Request:

```json
{
  "periodStart": "2026-04-01",
  "periodEnd": "2026-04-16",
  "includeRawData": true,
  "rules": ["Trial Balance", "TDS Reconciliation"]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "0d8f...",
    "status": "queued",
    "progress": 0,
    "startedAt": "2026-04-16T10:00:00.000Z"
  }
}
```

## GET `/status/:jobId`

Returns async job progress.

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "0d8f...",
    "status": "completed",
    "progress": 100,
    "reportId": "661f..."
  }
}
```

## GET `/reports`

Lists previous validation reports without raw snapshots.

Query parameters:

- `limit`: default `20`, max `100`.
- `skip`: default `0`.

## GET `/report/:reportId`

Returns a full validation report, including `rawDataSnapshots` if saved.

## GET `/drilldown/:checkName/:reportId`

Returns drilldown data for one check. URL-encode check names containing spaces or `/`.

Example:

`/api/validate/drilldown/TDS%20Reconciliation/661f...`

## POST `/feedback`

Stores auditor feedback for a finding in `validation_issue_feedback`.

Request:

```json
{
  "reportId": "661f...",
  "checkName": "TDS Reconciliation",
  "reason": "Verified as expected because challan is scheduled tomorrow."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "saved": true
  }
}
```

## GET `/settings`

Returns validation scheduler/alert settings for the tenant.

Response:

```json
{
  "success": true,
  "data": {
    "scheduleEnabled": true,
    "cron": "0 2 * * *",
    "timezone": "Asia/Kolkata",
    "alertEmails": ["accounts@example.com"],
    "source": "database"
  }
}
```

## POST `/settings`

Stores validation settings in `validation_settings`.

Request:

```json
{
  "scheduleEnabled": true,
  "cron": "0 2 * * *",
  "timezone": "Asia/Kolkata",
  "alertEmails": ["accounts@example.com"]
}
```

## Validation Report Shape

```json
{
  "_id": "661f...",
  "runAt": "2026-04-16T10:00:00.000Z",
  "periodStart": "2026-04-01T00:00:00.000Z",
  "periodEnd": "2026-04-16T23:59:59.999Z",
  "summary": {
    "totalChecks": 13,
    "critical": 1,
    "warning": 2,
    "info": 1,
    "passed": 9
  },
  "details": [
    {
      "checkName": "Trial Balance",
      "status": "PASS",
      "severity": "info",
      "expected": { "totalDebit": 500000, "totalCredit": 500000 },
      "actual": { "totalDebit": 500000, "totalCredit": 500000 },
      "possibleCauses": [],
      "suggestedFix": "No action required."
    }
  ]
}
```

