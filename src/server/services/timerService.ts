import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { TRANSACTION_STATUS } from "@/server/domain/constants";
import { relayManager } from "@/server/relay/relayManager";

type JobMap = Map<string, NodeJS.Timeout>;

class TimerService {
  private jobs: JobMap = new Map();
  private lock = new Set<string>();
  private bootstrapped = false;
  private sweepInterval: NodeJS.Timeout | null = null;

  async bootstrap() {
    if (this.bootstrapped) {
      return;
    }
    this.bootstrapped = true;

    const running = await prisma.transaction.findMany({
      where: {
        status: TRANSACTION_STATUS.running
      }
    });

    for (const transaction of running) {
      this.scheduleExpiry(transaction.id, transaction.expectedEndAt);
    }

    this.sweepInterval = setInterval(() => {
      this.sweepDueTransactions().catch((error) => {
        logger.error("Error en barrido de timers", { error: String(error) });
      });
    }, 30_000);
  }

  scheduleExpiry(transactionId: string, expectedEndAt: Date) {
    const existing = this.jobs.get(transactionId);
    if (existing) {
      clearTimeout(existing);
    }
    const delayMs = Math.max(0, expectedEndAt.getTime() - Date.now());
    const timeout = setTimeout(() => {
      this.expireTransaction(transactionId, "scheduled").catch((error) =>
        logger.error("Error en expiracion programada", { error: String(error), transactionId })
      );
    }, delayMs);
    this.jobs.set(transactionId, timeout);
  }

  unschedule(transactionId: string) {
    const existing = this.jobs.get(transactionId);
    if (existing) {
      clearTimeout(existing);
      this.jobs.delete(transactionId);
    }
  }

  async sweepDueTransactions() {
    const now = new Date();
    const due = await prisma.transaction.findMany({
      where: {
        status: TRANSACTION_STATUS.running,
        expectedEndAt: {
          lte: now
        }
      },
      select: { id: true }
    });

    for (const row of due) {
      await this.expireTransaction(row.id, "sweep");
    }
  }

  async expireTransaction(transactionId: string, source: "scheduled" | "sweep" | "recovery") {
    if (this.lock.has(transactionId)) {
      return;
    }
    this.lock.add(transactionId);

    try {
      const tx = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { machine: true }
      });

      if (!tx) {
        this.unschedule(transactionId);
        return;
      }

      if (tx.status !== TRANSACTION_STATUS.running) {
        this.unschedule(transactionId);
        return;
      }

      if (tx.expectedEndAt > new Date() && source !== "recovery") {
        this.scheduleExpiry(tx.id, tx.expectedEndAt);
        return;
      }

      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          relayOffAttemptedAt: new Date()
        }
      });

      await relayManager.turnOff(tx.machine.relayChannel);

      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: TRANSACTION_STATUS.completed,
          endedAt: new Date(),
          relayTurnedOffAt: new Date(),
          relayFailureReason: null
        }
      });
      this.unschedule(tx.id);
      logger.info("Transaccion completada por expiracion", { transactionId: tx.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          relayFailureReason: `OFF_FAIL: ${message}`
        }
      });
      this.scheduleExpiry(transactionId, new Date(Date.now() + 30_000));
      logger.error("Fallo apagado de relay en expiracion", { transactionId, message });
    } finally {
      this.lock.delete(transactionId);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var timerServiceGlobal: TimerService | undefined;
}

export const timerService = global.timerServiceGlobal ?? new TimerService();

if (process.env.NODE_ENV !== "production") {
  global.timerServiceGlobal = timerService;
}
