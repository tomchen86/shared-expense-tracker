export { EditExpenseScreen as default } from '../../../src/ledger/expense-form-screen';
import { sheetReadError } from '../../../src/shell/read-error';

export const ErrorBoundary = sheetReadError('Cancel');
