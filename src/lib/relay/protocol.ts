export type RelayProtocol = {
  onCommand: (channel: number) => Buffer;
  offCommand: (channel: number) => Buffer;
};

export const asciiRelayProtocol: RelayProtocol = {
  onCommand(channel) {
    return Buffer.from(`relay on ${channel + 1}\n`, "utf8");
  },
  offCommand(channel) {
    return Buffer.from(`relay off ${channel + 1}\n`, "utf8");
  }
};
