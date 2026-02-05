import { readFileSync } from "fs";
import { config } from "@/config/index.js";

export function loadPrivateKey(): string {
  try {
    return readFileSync(config.HU_PRIVATE_KEY_PATH, "utf-8");
  } catch {
    return "";
  }
}
