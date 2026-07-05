import { config } from "dotenv";

export function loadLocalEnv() {
  config({ path: ".env", quiet: true });
  config({ path: ".env.local", quiet: true });
}
