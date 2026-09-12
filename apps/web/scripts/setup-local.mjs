import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

try {
  await writeFile(
    ".dev.vars",
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\nBOOTSTRAP_SECRET=${randomBytes(32).toString("hex")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created .dev.vars with local secrets. Read BOOTSTRAP_SECRET there to create your owner account.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".dev.vars already exists; keeping your secrets unchanged.");
}
