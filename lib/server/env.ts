// The mode the server runs in, and the environment from .env.local. Imported
// first (by server.mts, and by each module that reads a variable), so the
// variables are there before anything uses them.

import * as nextEnv from "@next/env";

// @next/env is CommonJS compiled from ES modules, without a default export.
// Node (running this as an ES module) puts its exports on `default`, and can't
// see them by name; tsx (running this .ts file as CommonJS) hands over the
// exports as they are. Either way, this finds them.
const { loadEnvConfig } = (nextEnv as typeof nextEnv & { default?: typeof nextEnv }).default ?? nextEnv;

export const production =
  process.argv.includes("--production") || process.env.NODE_ENV === "production";
if (production) (process.env as Record<string, string>).NODE_ENV = "production";
export const port = Number(process.env.PORT) || 3000;

// Load .env.local now (Next would only do it inside app.prepare()).
loadEnvConfig(process.cwd(), !production);
