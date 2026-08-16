/**
 * Runs once when the server starts.
 *
 * Validating configuration here means a bad deploy fails immediately with a
 * list of what is wrong, instead of serving requests that error somewhere
 * deep inside a client library.
 */
export async function register() {
  // Skip the Edge runtime: it gets a different, smaller env and the Node
  // instance already covers the check.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertEnv } = await import("@/lib/env");
  assertEnv();
}
