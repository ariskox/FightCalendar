import pino, { Logger as PinoLogger } from "pino";
import { LogLevel, Logger } from "../types.js";

export const createLogger = (level: LogLevel = "error"): Logger => {
  const instance: PinoLogger = pino({ level });
  return {
    debug: (message, meta) => instance.debug(meta ?? {}, message),
    info: (message, meta) => instance.info(meta ?? {}, message),
    warn: (message, meta) => instance.warn(meta ?? {}, message),
    error: (message, meta) => instance.error(meta ?? {}, message)
  };
};
