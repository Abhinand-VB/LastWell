import { notFound } from "next/navigation";
import { BOARD_LIVE } from "@/lib/boardLive";
import { EvidenceView } from "./EvidenceView";

export const metadata = { title: "LastWell · Live evidence" };

// Proposed D-57: exists only with NEXT_PUBLIC_BOARD_LIVE=convex; otherwise this route is a 404 as before.
export default async function EvidencePage({ params }: { params: Promise<{ callId: string }> }) {
  if (BOARD_LIVE !== "convex") notFound();
  const { callId } = await params;
  return <EvidenceView callId={callId} />;
}
