# Scaffold reference (for tasks S-01 / S-02)

Exact contents to create at the event. Kept here as text, not as live files, so that every line of the repository is written during the hacking window.

## package.json (root)

```json
{
  "name": "lastwell",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "dev:gateway": "pnpm --filter @lastwell/gateway dev",
    "dev:web": "pnpm --filter @lastwell/web dev"
  }
}
```

## pnpm-workspace.yaml

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

## .npmrc (root)

Teammates run on macOS and Windows. Scripts such as `"test:live": "LIVE=1 vitest run"` use POSIX env-var syntax, which fails under PowerShell/cmd unless pnpm emulates a shell:

```ini
shell-emulator=true
```

## tsconfig.base.json

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

## .gitignore

```
node_modules
dist
.next
.env
.env.*
!.env.example
apps/eval/audio/*.wav
apps/eval/results
*.log
.DS_Store
```

## packages/core/package.json

```json
{
  "name": "@lastwell/core",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:live": "LIVE=1 vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^1.0.0",
    "luxon": "^3.5.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/luxon": "^3.4.2",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0",
    "zod-to-json-schema": "^3.23.0"
  }
}
```

Live tests (`*.live.test.ts`) skip themselves when `LIVE` is unset, so `vitest run` is safe offline.

## packages/stt/package.json

```json
{
  "name": "@lastwell/stt",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "spike": "tsx scripts/spike.ts"
  },
  "dependencies": {
    "@lastwell/core": "workspace:*",
    "ws": "^8.18.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.12",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

## apps/gateway/package.json

```json
{
  "name": "@lastwell/gateway",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts | pino-pretty",
    "start": "tsx src/server.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@fastify/formbody": "^8.0.0",
    "@fastify/websocket": "^11.0.0",
    "@lastwell/core": "workspace:*",
    "@lastwell/stt": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "fastify": "^5.0.0",
    "luxon": "^3.5.0",
    "pino": "^9.0.0",
    "twilio": "^5.3.0",
    "ws": "^8.18.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/luxon": "^3.4.2",
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.12",
    "pino-pretty": "^11.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

## apps/eval/package.json

```json
{
  "name": "@lastwell/eval",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "eval": "tsx src/run.ts",
    "validate": "tsx src/validate.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@lastwell/core": "workspace:*",
    "@lastwell/stt": "workspace:*",
    "luxon": "^3.5.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/luxon": "^3.4.2",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

## apps/web

Create with `pnpm create next-app@latest apps/web --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*"`, then set `"name": "@lastwell/web"`, add `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, dependencies `@lastwell/core: workspace:*`, `@supabase/supabase-js`, `zod`, and in `next.config.ts`: `transpilePackages: ["@lastwell/core"]` (the package exports TypeScript source).

## Package tsconfig.json (each package)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "types": ["node"] },
  "include": ["src", "scripts"]
}
```

No `rootDir` (packages with a `scripts/` folder would fail TS6059). The web app keeps the tsconfig that `create-next-app` generates.
