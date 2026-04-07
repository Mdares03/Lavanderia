import "server-only";

import { asciiRelayProtocol, type RelayProtocol } from "@/lib/relay/protocol";
import type { RelayController } from "@/lib/relay/types";

export class SerialRelayController implements RelayController {
  private serialPort: import("serialport").SerialPort | null = null;

  constructor(private readonly protocol: RelayProtocol = asciiRelayProtocol) {}

  async connect(port: string, baudRate: number): Promise<void> {
    const SerialPort = await this.getSerialPortCtor();
    if (this.serialPort?.isOpen) {
      return;
    }
    this.serialPort = new SerialPort({
      path: port,
      baudRate,
      autoOpen: false
    });
    await new Promise<void>((resolve, reject) => {
      this.serialPort?.open((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async turnOn(channel: number): Promise<void> {
    await this.write(this.protocol.onCommand(channel));
  }

  async turnOff(channel: number): Promise<void> {
    await this.write(this.protocol.offCommand(channel));
  }

  async getStatus(): Promise<boolean> {
    return this.serialPort?.isOpen ?? false;
  }

  async disconnect(): Promise<void> {
    if (!this.serialPort?.isOpen) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.serialPort?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.serialPort = null;
  }

  private async write(command: Buffer) {
    const port = this.serialPort;
    if (!port || !port.isOpen) {
      throw new Error("Puerto serial no conectado");
    }
    await new Promise<void>((resolve, reject) => {
      port.write(command, (error) => {
        if (error) {
          reject(error);
          return;
        }
        port.drain((drainError) => {
          if (drainError) {
            reject(drainError);
            return;
          }
          resolve();
        });
      });
    });
  }

  static async listPorts() {
    const { SerialPort } = await import("serialport");
    return SerialPort.list();
  }

  private async getSerialPortCtor() {
    const { SerialPort } = await import("serialport");
    return SerialPort;
  }
}
