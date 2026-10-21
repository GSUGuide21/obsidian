// Every event a connection can send, by area. Each file registers its own.

import type { ChatSocket } from "../state.ts";
import { registerSessionHandlers } from "./session.ts";
import { registerMessagesHandlers } from "./messages.ts";
import { registerGroupsHandlers } from "./groups.ts";
import { registerMembersHandlers } from "./members.ts";
import { registerModerationHandlers } from "./moderation.ts";
import { registerAdminHandlers } from "./admin.ts";
import { registerIntegrationsHandlers } from "./integrations.ts";
import { registerCallsHandlers } from "./calls.ts";
import { registerSavedHandlers } from "./saved.ts";
import { registerRolesHandlers } from "./roles.ts";
import { registerPeopleHandlers } from "./people.ts";

export function registerHandlers(socket: ChatSocket) {
  registerSessionHandlers(socket);
  registerMessagesHandlers(socket);
  registerGroupsHandlers(socket);
  registerMembersHandlers(socket);
  registerModerationHandlers(socket);
  registerAdminHandlers(socket);
  registerIntegrationsHandlers(socket);
  registerCallsHandlers(socket);
  registerSavedHandlers(socket);
  registerRolesHandlers(socket);
  registerPeopleHandlers(socket);
}
