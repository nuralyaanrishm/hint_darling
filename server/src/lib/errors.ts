/** An error that carries an HTTP status code for the API error handler. */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;
  /**
   * Optional machine-readable code (e.g. `ALREADY_CLAIMED`) so the client can
   * react to a specific condition without matching on human-readable copy.
   */
  readonly code?: string;

  constructor(
    status: number,
    message: string,
    details?: unknown,
    code?: string,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
    this.code = code;
  }
}
