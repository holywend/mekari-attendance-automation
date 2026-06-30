import fs from "node:fs/promises";
import path from "node:path";
import type { Credentials } from "./types";

export class CredentialStore {
  constructor(private filePath: string) {}

  async read(): Promise<Credentials | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as Credentials;
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        "code" in e &&
        (e as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return null;
      }
      if (e instanceof SyntaxError) return null;
      throw e;
    }
  }

  async write(creds: Credentials): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(creds, null, 2), "utf8");
    await fs.rename(tmp, this.filePath);
  }
}
