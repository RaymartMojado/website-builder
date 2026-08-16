import { config } from "dotenv";
import { WebSocket } from "ws";

/**
 * Tests ALWAYS run against local Supabase, never a hosted project — these
 * suites truncate tables. .env.test is loaded with override so it wins over
 * whatever .env points at, and the assertion below is the backstop if someone
 * deletes or edits it.
 */
config({ path: ".env.test", override: true, quiet: true });

// React needs this flag before act() will flush effects rather than warn.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// supabase-js constructs a realtime client that expects a global WebSocket.
// Node gained one natively in 22; on 20 it must be polyfilled. supabase-js also
// warns that Node 20 is deprecated — see the version note in README.md.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

const url = process.env.DATABASE_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const isLocal = (value: string) =>
  value.includes("localhost") || value.includes("127.0.0.1") || value.includes("host.docker.internal");

if (!isLocal(url)) {
  throw new Error(
    `Refusing to run tests against a non-local database: ${url.replace(/:[^:@]*@/, ":***@")}`,
  );
}

if (supabaseUrl && !isLocal(supabaseUrl)) {
  throw new Error(`Refusing to run tests against a non-local Supabase: ${supabaseUrl}`);
}
