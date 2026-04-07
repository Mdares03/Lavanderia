import "server-only";

import { recoveryService } from "@/server/services/recoveryService";

let bootPromise: Promise<void> | null = null;

export function ensureSystemBootstrapped() {
  if (!bootPromise) {
    bootPromise = recoveryService.restoreOnBoot().catch((error) => {
      bootPromise = null;
      throw error;
    });
  }
  return bootPromise;
}
