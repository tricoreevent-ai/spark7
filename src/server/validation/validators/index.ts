import { ValidationRule } from '../types.js';
import { balanceSheetValidator } from './balanceSheetValidator.js';
import { cashBankBookValidator } from './cashBankBookValidator.js';
import { depreciationValidator } from './depreciationValidator.js';
import { doubleEntryValidator } from './doubleEntryValidator.js';
import { gstReconciliationValidator } from './gstReconciliationValidator.js';
import { missingSequenceValidator } from './missingSequenceValidator.js';
import { orphanRecordsValidator } from './orphanRecordsValidator.js';
import { periodLockValidator } from './periodLockValidator.js';
import { roundOffValidator } from './roundOffValidator.js';
import { salesCogsValidator } from './salesCogsValidator.js';
import { suspenseAccountValidator } from './suspenseAccountValidator.js';
import { tdsReconciliationValidator } from './tdsReconciliationValidator.js';
import { trialBalanceValidator } from './trialBalanceValidator.js';
import { vendorCustomerReconciliationValidator } from './vendorCustomerReconciliationValidator.js';

export const validationRules: ValidationRule[] = [
  doubleEntryValidator,
  trialBalanceValidator,
  balanceSheetValidator,
  salesCogsValidator,
  tdsReconciliationValidator,
  gstReconciliationValidator,
  vendorCustomerReconciliationValidator,
  missingSequenceValidator,
  periodLockValidator,
  orphanRecordsValidator,
  cashBankBookValidator,
  depreciationValidator,
  suspenseAccountValidator,
  roundOffValidator,
];
