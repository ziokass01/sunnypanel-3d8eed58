import {usePanelRole} from "@/hooks/use-panel-role";
import {ModeratorLicenses} from "@/features/moderator/ModeratorLicenses";
import { LicensesListView } from "@/features/licenses/LicensesListView";

export function LicensesListPage() {
  const {role,userId}=usePanelRole();if(role==="moderator")return <ModeratorLicenses key={userId}/>;return <LicensesListView filterMode="all" title="Licenses" />;
}

