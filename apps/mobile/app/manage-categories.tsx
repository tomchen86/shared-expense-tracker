export { ManageCategoriesSheet as default } from '../src/categories/manage-categories-screen';
import { sheetReadError } from '../src/shell/read-error';

export const ErrorBoundary = sheetReadError('Close');
