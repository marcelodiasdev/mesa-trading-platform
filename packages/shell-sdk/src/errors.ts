export abstract class ServiceError extends Error {
  abstract readonly kind: string;
  constructor(
    message: string,
    readonly correlationId: string,
  ) {
    super(message);
  }
}

export class HttpError extends ServiceError {
  readonly kind = "http";
  constructor(
    readonly status: number,
    readonly service: string,
    readonly path: string,
    correlationId: string,
    readonly body?: unknown,
  ) {
    super(`${service} ${path} responded ${status}`, correlationId);
    this.name = "HttpError";
  }
}

export class NetworkError extends ServiceError {
  readonly kind = "network";
  constructor(
    service: string,
    correlationId: string,
    override readonly cause: unknown,
  ) {
    super(`${service} is unreachable`, correlationId);
    this.name = "NetworkError";
  }
}

/** The request exceeded its deadline. */
export class TimeoutError extends ServiceError {
  readonly kind = "timeout";
  constructor(
    service: string,
    readonly timeoutMs: number,
    correlationId: string,
  ) {
    super(`${service} did not respond within ${timeoutMs}ms`, correlationId);
    this.name = "TimeoutError";
  }
}

export class ContractViolationError extends ServiceError {
  readonly kind = "contract";
  constructor(
    readonly service: string,
    readonly path: string,
    correlationId: string,
    readonly issues: readonly { path: string; message: string }[],
  ) {
    super(
      `${service} ${path} broke its contract: ${issues
        .map((i) => `${i.path || "(root)"} ${i.message}`)
        .join("; ")}`,
      correlationId,
    );
    this.name = "ContractViolationError";
  }
}
