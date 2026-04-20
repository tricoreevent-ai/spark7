# Add a New Validation Rule

## 1. Create the Validator

Add a file in:

`src/server/validation/validators/myNewRuleValidator.ts`

Implement the `ValidationRule` contract:

```ts
import { ValidationRule } from '../types.js';
import { makeResult, withTimer } from './helpers.js';

export const myNewRuleValidator: ValidationRule = {
  name: 'My New Rule',
  description: 'Human-readable purpose of the rule.',
  run: (context) =>
    withTimer('My New Rule', async () => {
      // Use context.db.collection(...) only.
      // Do not import existing Mongoose models for accounting collections.
      return makeResult({
        checkName: 'My New Rule',
        passed: true,
        severity: 'info',
        expected: {},
        actual: {},
        possibleCauses: [],
        suggestedFix: 'No action required.',
      });
    }),
};
```

## 2. Register the Rule

Open:

`src/server/validation/validators/index.ts`

Import and add your rule to `validationRules`.

## 3. Add Configuration

If your rule needs a collection or field name, add it to:

`src/server/validation/config/validationConfig.ts`

Do not hard-code collection names inside the validator unless it is a new validation-only collection.

## 4. Add Documentation

Update:

`docs/validation/VALIDATION_RULES.md`

Include:

- What the rule checks.
- Collections used.
- Aggregation/pipeline logic.
- Common causes and suggested fixes.

## 5. Test

Run:

```bash
npm run build:server
npm run build:client
npm test
```

Optional manual test:

```bash
POST /api/validate/run
GET /api/validate/status/:jobId
GET /api/validate/report/:reportId
```

## Safety Rules

- Never mutate existing accounting collections.
- Use raw MongoDB collections through `context.db`.
- Store only report/feedback/settings data in validation-owned collections.
- Use `withTimer` so failed validator queries produce a structured result instead of crashing the whole run.

