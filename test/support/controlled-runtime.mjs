import { createMuhaRuntime } from "@muha-sdk/core";

// These fixtures use controlled native programs. Keep structured failures
// visible when Node's test reporter omits Error.data or prints [Object].
export async function controlledOperation(operation, action) {
  try { return await action(); }
  catch (error) {
    console.error(`${operation}:`, JSON.stringify(error.data ?? { message: error.message }));
    throw error;
  }
}

export function createControlledRuntime(options) {
  return controlledOperation("Controlled Runtime initialization failed", () => createMuhaRuntime(options));
}
