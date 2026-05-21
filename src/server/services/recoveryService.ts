import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { TRANSACTION_STATUS } from "@/server/domain/constants";
import { relayManager } from "@/server/relay/relayManager";
import { ensureInitialMachineCatalogSeed } from "@/server/services/machineService";
import { timerService } from "@/server/services/timerService";

class RecoveryService {
  private restored = false;

  async restoreOnBoot() {
    if (this.restored) {
      return;
    }
    this.restored = true;

    await relayManager.init();
    await ensureInitialMachineCatalogSeed();
    await timerService.bootstrap();

    const now = new Date();
    const running = await prisma.transaction.findMany({
      where: {
        status: TRANSACTION_STATUS.running
      },
      include: { machine: true }
    });

    for (const transaction of running) {
      if (transaction.expectedEndAt <= now) {
        await timerService.expireTransaction(transaction.id, "recovery");
        continue;
      }
      try {
        if (transaction.machine.relayChannel !== null) {
          await relayManager.turnOn(transaction.machine.relayChannel);
        }
      } catch (error) {
        logger.warn("No se pudo reactivar relay en recuperacion", {
          transactionId: transaction.id,
          error: String(error)
        });
      }
      timerService.scheduleExpiry(transaction.id, transaction.expectedEndAt);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var recoveryServiceGlobal: RecoveryService | undefined;
}

export const recoveryService = global.recoveryServiceGlobal ?? new RecoveryService();

if (process.env.NODE_ENV !== "production") {
  global.recoveryServiceGlobal = recoveryService;
}
