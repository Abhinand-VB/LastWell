// Proposed D-57 (CONVEX_AUDIO_STORAGE): the Sonic briefing bytes (µ-law 8 kHz) are kept in Convex
// file storage, linked from the alert row, so "Call again" / "Play briefing" after a gateway restart
// replays the exact audio instead of re-synthesizing. Gateway only: every function checks the secret.
import { v } from "convex/values";
import { assertSecret, mutation, query } from "./lib.js";

/** Step 1 of an upload: a short-lived URL the gateway POSTs the bytes to; the reply carries `storageId`. */
export const generateUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertSecret(secret);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 2: link the uploaded file to the alert (replacing and deleting any earlier one). False if the alert is unknown. */
export const attachBriefingAudio = mutation({
  args: { secret: v.string(), alertId: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { secret, alertId, storageId }) => {
    assertSecret(secret);
    const alert = await ctx.db.query("alerts").withIndex("by_alertId", (q) => q.eq("alertId", alertId)).unique();
    if (alert === null) {
      await ctx.storage.delete(storageId);
      return false;
    }
    const previous = alert.audioStorageId;
    await ctx.db.patch(alert._id, { audioStorageId: storageId });
    if (previous !== undefined && previous !== storageId) await ctx.storage.delete(previous);
    return true;
  },
});

/** A download URL for the alert's stored briefing, or null when there is none. */
export const briefingAudioUrl = query({
  args: { secret: v.string(), alertId: v.string() },
  handler: async (ctx, { secret, alertId }) => {
    assertSecret(secret);
    const alert = await ctx.db.query("alerts").withIndex("by_alertId", (q) => q.eq("alertId", alertId)).unique();
    if (alert?.audioStorageId === undefined) return null;
    return await ctx.storage.getUrl(alert.audioStorageId);
  },
});
