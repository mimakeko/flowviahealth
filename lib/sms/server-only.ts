export function assertServerOnlyModule() {
  if (typeof window !== "undefined") {
    throw new Error("Flowvia SMS modules are server-only.");
  }
}
