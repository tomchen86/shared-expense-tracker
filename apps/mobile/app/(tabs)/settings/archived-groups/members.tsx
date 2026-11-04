import { MembersScreen } from '../../../../src/groups/members-screen';

export default function ArchivedGroupMembersRoute() {
  return <MembersScreen inSettings />;
}
import { sheetReadError } from '../../../../src/shell/read-error';

export const ErrorBoundary = sheetReadError('Close');
