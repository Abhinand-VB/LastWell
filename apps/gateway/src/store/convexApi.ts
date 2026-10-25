// Typed references to the Convex functions in ../../convex, the same shape `npx convex dev`
// generates in convex/_generated/api. Works before codegen has run, so the gateway builds and
// tests without a Convex login. Use with ConvexHttpClient: `client.mutation(api.store.insertCall, …)`.
import { anyApi, type ApiFromModules, type FilterApi, type FunctionReference } from "convex/server";
import type * as audio from "../../convex/audio.js";
import type * as board from "../../convex/board.js";
import type * as limits from "../../convex/limits.js";
import type * as store from "../../convex/store.js";

type FullApi = ApiFromModules<{ audio: typeof audio; board: typeof board; limits: typeof limits; store: typeof store }>;

export const api = anyApi as unknown as FilterApi<FullApi, FunctionReference<"query" | "mutation" | "action", "public">>;
