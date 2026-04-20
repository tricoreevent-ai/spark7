# Validation Dashboard Frontend

Route:

`/accounting/validation`

Menu:

`Top menu -> Validation -> Validation Dashboard`

## Structure

```text
src/client/validation/
  components/
    DetailedReport.tsx
    DrillDownModal.tsx
    HealthGauge.tsx
    ReportList.tsx
    SummaryCards.tsx
    TimelineChart.tsx
    ValidationAssistantPanel.tsx
    ValidationControls.tsx
  hooks/
    useValidationReports.ts
  mock/
    mockValidationData.ts
  pages/
    ValidationDashboard.tsx
  services/
    validationApi.ts
  types.ts
  utils.ts
```

## Data Access

The UI never reads MongoDB directly. It uses:

- `axios` service layer in `validationApi.ts`
- TanStack Query hooks in `useValidationReports.ts`

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Existing API base URL support. |
| `VITE_VALIDATION_USE_MOCKS=true` | Use mock validation reports for UI development. |

## Main Components

- `ValidationDashboard`: page composition, selected report state, exports, job polling.
- `ValidationControls`: manual validation run and scheduler/alert settings form.
- `SummaryCards`: total checks, critical, warning, passed.
- `HealthGauge`: weighted compliance score.
- `TimelineChart`: Recharts line chart for run trends.
- `ReportList`: searchable/sortable report table.
- `DetailedReport`: expandable check categories, causes, suggestions, drilldown trigger.
- `DrillDownModal`: raw Mongo snapshot display, copy JSON, false-positive feedback.
- `ValidationAssistantPanel`: rule-based assistant for common accountant questions.

## Add a Visualization

1. Add a new component in `src/client/validation/components`.
2. Read data from `ValidationReport.details` or `rawDataSnapshots`.
3. Add it to `ValidationDashboard.tsx`.
4. Keep export logic in the page unless the visualization needs its own file output.

## Exports

- PDF uses `jspdf`.
- Excel uses `xlsx`.

## Development

```bash
npm run dev:server
npm run dev:client
```

Then open:

`http://localhost:5173/accounting/validation`

For mock-only frontend work:

```bash
VITE_VALIDATION_USE_MOCKS=true npm run dev:client
```
