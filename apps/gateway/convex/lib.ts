// Typed function builders and the shared-secret guard. `npx convex dev` also generates
// convex/_generated/; these builders type-check without it, so the repo builds before anyone has
// logged in to Convex.
import {
  mutationGeneric,
  queryGeneric,
  type DataModelFromSchemaDefinition,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import type schema from "./schema.js";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;

export const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
export const query = queryGeneric as QueryBuilder<DataModel, "public">;

/**
 * Every function is public on the deployment URL, so each one takes `secret` and compares it with
 * the deployment's INTERNAL_API_KEY (set with `npx convex env set INTERNAL_API_KEY …`, same value
 * as the gateway's). Fails closed when the variable is missing.
 */
export function assertSecret(secret: string): void {
  const expected = process.env.INTERNAL_API_KEY;
  if (expected === undefined || expected === "" || secret !== expected) {
    throw new Error("unauthorized");
  }
}
