// Ports for the X-03 run, offset from the defaults so a developer's own dev:fake on 8787/3000 keeps running.
export const GATEWAY_PORT = Number(process.env.E2E_GATEWAY_PORT ?? 18787);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 13000);
