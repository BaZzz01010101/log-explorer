import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { AwsAccessGate } from "./security";

/** Local application preference, deliberately excluded from workspace imports. */
export class AwsAccessPreference {
  private readonly gate: AwsAccessGate;
  constructor(
    private readonly allowed: boolean,
    private readonly path: string,
  ) {
    this.gate = new AwsAccessGate(allowed);
    if (!allowed) return;
    try {
      if (statSync(path).size <= 8192) {
        const value = JSON.parse(readFileSync(path, "utf8"));
        if (value?.awsEnabled === true) this.gate.setEnabled(true);
      }
    } catch {
      /* Missing or damaged preferences start disabled. */
    }
  }
  get enabled() {
    return this.gate.enabled;
  }
  setEnabled(enabled: boolean): void {
    if (!enabled) this.gate.setEnabled(false);
    if (enabled && !this.allowed) this.gate.setEnabled(true);
    if (this.allowed) {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(
        this.path + ".tmp",
        JSON.stringify({ awsEnabled: enabled }),
        { mode: 0o600 },
      );
      renameSync(this.path + ".tmp", this.path);
    }
    this.gate.setEnabled(enabled);
  }
}
