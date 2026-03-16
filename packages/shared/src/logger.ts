import { Axiom } from "@axiomhq/js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  component?: string;
  operation?: string;
  url?: string;
  traceId?: string;
  durationMs?: number;
  success?: boolean;
  errorCode?: string;
  [key: string]: unknown;
}

export interface AxiomConfig {
  token: string;
  dataset: string;
}

export interface LoggerConfig {
  service: string;
  environment?: string;
  minLevel?: LogLevel;
  defaultContext?: LogContext;
  axiom?: AxiomConfig;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function serializeError(err: Error): Record<string, unknown> {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
}

function processContext(context: LogContext): LogContext {
  const result: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (value instanceof Error) {
      result[key] = serializeError(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class AppLogger {
  private service: string;
  private environment: string | undefined;
  private minLevel: LogLevel;
  private context: LogContext;
  private axiomClient: Axiom | null;
  private axiomDataset: string | null;

  constructor(config: LoggerConfig, context?: LogContext) {
    this.service = config.service;
    this.environment = config.environment;
    this.minLevel = config.minLevel ?? "info";
    this.context = { ...config.defaultContext, ...context };

    if (config.axiom?.token && config.axiom?.dataset) {
      try {
        this.axiomClient = new Axiom({ token: config.axiom.token });
        this.axiomDataset = config.axiom.dataset;
      } catch {
        this.axiomClient = null;
        this.axiomDataset = null;
      }
    } else {
      this.axiomClient = null;
      this.axiomDataset = null;
    }
  }

  child(additionalContext: LogContext): AppLogger {
    const child = new AppLogger({
      service: this.service,
      environment: this.environment,
      minLevel: this.minLevel,
      defaultContext: { ...this.context, ...additionalContext },
    });
    child.axiomClient = this.axiomClient;
    child.axiomDataset = this.axiomDataset;
    return child;
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  /**
   * Start a timed operation. Call the returned function when done.
   *
   * @example
   * const done = logger.time("Fetching analytics");
   * // ... do work ...
   * done({ success: true });
   */
  time(message: string, context?: LogContext): (endContext?: LogContext) => void {
    const startTime = Date.now();
    this.debug(`${message} [started]`, context);

    return (endContext?: LogContext) => {
      const durationMs = Date.now() - startTime;
      const merged = { ...context, ...endContext, durationMs };
      const level = endContext?.success === false ? "error" : "info";
      this.log(level, `${message} [completed]`, merged);
    };
  }

  /**
   * Flush pending Axiom logs.
   * Call inside ctx.waitUntil() before the worker terminates.
   */
  async flush(): Promise<void> {
    try {
      if (this.axiomClient) {
        await this.axiomClient.flush();
      }
    } catch (err) {
      console.error("Failed to flush logs to Axiom:", err);
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const mergedContext = processContext({ ...this.context, ...context });
    const timestamp = new Date().toISOString();

    const entry: Record<string, unknown> = {
      level,
      message,
      service: this.service,
      ...(this.environment && { environment: this.environment }),
      timestamp,
      ...(Object.keys(mergedContext).length > 0 && { context: mergedContext }),
    };

    const output = JSON.stringify(entry);
    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
    }

    if (this.axiomClient && this.axiomDataset) {
      try {
        this.axiomClient.ingest(this.axiomDataset, [entry]);
      } catch {
        // Never fail logging
      }
    }
  }
}

/**
 * Create a logger for a specific service.
 *
 * @example
 * const logger = createLogger({
 *   service: "hotmetal-content-analyzer",
 *   axiom: { token: env.AXIOM_TOKEN, dataset: env.AXIOM_DATASET },
 * });
 */
export function createLogger(config: LoggerConfig): AppLogger {
  return new AppLogger(config);
}

// ── Singleton helpers for Cloudflare Workers ─────────────────────────

let _singleton: AppLogger | null = null;

/**
 * Initialize the singleton logger with Axiom config from env.
 * Call once per request in middleware / queue / scheduled handler.
 */
export function initLogger(
  service: string,
  axiom?: AxiomConfig,
): AppLogger {
  if (!_singleton) {
    _singleton = createLogger({ service, axiom });
  }
  return _singleton;
}

/**
 * Get the current singleton logger instance.
 * Falls back to a console-only logger if initLogger hasn't been called.
 */
export function logger(service = "hotmetal"): AppLogger {
  if (!_singleton) {
    _singleton = createLogger({ service });
  }
  return _singleton;
}

/**
 * Flush pending Axiom logs.
 * Call inside ctx.waitUntil() at the end of each request.
 */
export async function flushLogs(): Promise<void> {
  if (_singleton) {
    await _singleton.flush();
  }
}
