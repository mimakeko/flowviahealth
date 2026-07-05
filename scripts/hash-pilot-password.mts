import { createScryptPasswordHash } from "../lib/pilot/session.ts";

const password = process.env.FLOWVIA_PASSWORD_TO_HASH;

if (!password || password.length < 12) {
  throw new Error("Set FLOWVIA_PASSWORD_TO_HASH to a pilot password of at least 12 characters. The password itself is not printed.");
}

console.log(createScryptPasswordHash(password));
