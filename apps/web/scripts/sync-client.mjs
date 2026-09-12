import { copyFile } from "node:fs/promises";

// Both npm and snippet users run the same tracker implementation.
await copyFile(
  new URL(import.meta.resolve("@yaap/client/script.js")),
  new URL("../public/script.js", import.meta.url),
);
