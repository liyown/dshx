import { adminOperationList } from "./api/operations/admin";
import { catalogOperationList } from "./api/operations/catalog";
import { cliOperationList } from "./api/operations/cli";
import { v1ContentOperationList } from "./api/operations/v1-content";
import { v1PluginOperationList } from "./api/operations/v1-plugins";
import { v1ReportOperationList } from "./api/operations/v1-reports";
import type { ApiOperationDefinition, ApiOperationTag } from "./api/operation";

/**
 * The published API is a projection over the endpoint declarations.
 *
 * Every endpoint is declared once, beside the route that serves it (see
 * `lib/api/operation.ts`). This module only puts those declarations in the
 * order the document reads them. Adding an endpoint to a family list is
 * therefore the whole act of publishing it: there is no second list to update,
 * and no way for the served API and the documented one to disagree.
 */
export const API_OPERATION_DEFINITIONS: readonly ApiOperationDefinition[] = [
  ...catalogOperationList,
  ...v1PluginOperationList,
  ...v1ContentOperationList,
  ...v1ReportOperationList,
  ...adminOperationList,
  ...cliOperationList,
];

export function operationsForTag(tag: ApiOperationTag): readonly ApiOperationDefinition[] {
  return API_OPERATION_DEFINITIONS.filter((operation) => operation.tag === tag);
}

export type {
  ApiOperationAuthentication,
  ApiOperationDefinition,
  ApiOperationErrorStatus,
  ApiOperationMethod,
  ApiOperationTag,
} from "./api/operation";
