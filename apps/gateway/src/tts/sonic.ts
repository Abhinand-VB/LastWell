// Briefing pre-synthesis (docs/05 §7): Cartesia Sonic /tts/bytes → raw µ-law 8 kHz. FakeTts returns
// silence of max(1500, 60 ms × words) ms (docs/10 §4).

export interface TtsClient {
  /** Raw µ-law 8 kHz mono bytes, no header. Throws on vendor failure or timeout. */
  synthesize(text: string): Promise<Buffer>;
}

export interface SonicConfig {
  apiKey: string;
  cartesiaVersion: string;
  model: string;
  voiceId: string;
  timeoutMs?: number;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function sonicRequestBody(cfg: Pick<SonicConfig, "model" | "voiceId">, text: string): Record<string, unknown> {
  return {
    model_id: cfg.model,
    transcript: text,
    voice: { mode: "id", id: cfg.voiceId },
    language: "en",
    output_format: { container: "raw", encoding: "pcm_mulaw", sample_rate: 8000 },
  };
}

export class SonicTts implements TtsClient {
  constructor(private readonly cfg: SonicConfig) {}

  async synthesize(text: string): Promise<Buffer> {
    const f = this.cfg.fetch ?? fetch;
    const res = await f(`${this.cfg.baseUrl ?? "https://api.cartesia.ai"}/tts/bytes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Cartesia-Version": this.cfg.cartesiaVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sonicRequestBody(this.cfg, text)),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cartesia Sonic HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("Cartesia Sonic returned no audio");
    return buf;
  }
}

export class FakeTts implements TtsClient {
  calls: string[] = [];
  async synthesize(text: string): Promise<Buffer> {
    this.calls.push(text);
    const words = text.split(/\s+/).filter((w) => w !== "").length;
    const ms = Math.max(1500, 60 * words);
    return Buffer.alloc(ms * 8, 0xff);
  }
}
