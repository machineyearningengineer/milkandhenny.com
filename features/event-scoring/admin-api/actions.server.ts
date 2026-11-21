import { eventsOperation } from "@/features/events/events-operation.server";
import { configurationActions } from "./configuration.server";
import { discoveryActions } from "./discoveries.server";
import { identityActions } from "./identity.server";
import { ledgerActions } from "./ledger.server";
import { mediaExportActions } from "./media-export.server";
import { staffingActions } from "./staffing.server";
import type { AdminScoringActionContext, AdminScoringActionHandlers } from "./shared";

const ACTIONS: AdminScoringActionHandlers = {
  ...configurationActions,
  ...ledgerActions,
  ...discoveryActions,
  ...staffingActions,
  ...mediaExportActions,
  ...identityActions,
};

export function adminScoringAction(action: string | undefined, context: AdminScoringActionContext) {
  return eventsOperation(
    {
      domain: "event-scoring",
      operation: "admin_action",
      kind: "idempotent-mutation",
      timeoutMs: 45_000,
    },
    async () => {
      const handler = action && Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : undefined;
      return handler
        ? handler(context)
        : Response.json({ error: "Unknown scoring action" }, { status: 400 });
    },
  );
}
