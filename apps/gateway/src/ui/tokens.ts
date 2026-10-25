// Short-lived WebSocket tokens (docs/03 §5): 32 random bytes as hex, valid for 600 s, reusable until expiry.
import { randomBytes } from "node:crypto";

export const TOKEN_TTL_S = 600;

export class TokenStore {
  private tokens = new Map<string, number>();
  constructor(private readonly now: () => number = Date.now) {}

  issue(): { token: string; expiresInS: number } {
    this.sweep();
    const token = randomBytes(32).toString("hex");
    this.tokens.set(token, this.now() + TOKEN_TTL_S * 1000);
    return { token, expiresInS: TOKEN_TTL_S };
  }

  valid(token: string | undefined | null): boolean {
    if (!token) return false;
    const exp = this.tokens.get(token);
    return exp !== undefined && exp > this.now();
  }

  private sweep(): void {
    const t = this.now();
    for (const [k, exp] of this.tokens) if (exp <= t) this.tokens.delete(k);
  }
}
