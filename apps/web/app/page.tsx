import { VERSION } from "@lastwell/core";

export default function Home() {
  return (
    <main className="min-h-screen p-8 font-sans">
      <h1 className="text-2xl font-semibold">LastWell</h1>
      <p className="mt-2 text-sm opacity-70">core {VERSION}</p>
    </main>
  );
}
