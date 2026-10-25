import { ConsoleView } from "./ConsoleView";

export default async function ConsolePage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return <ConsoleView callId={callId} />;
}
