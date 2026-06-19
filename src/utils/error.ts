export class BpsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string
  ) {
    super(message);
    this.name = "BpsApiError";
  }
}

export class BpsNotFoundError extends BpsApiError {
  constructor(resource: string) {
    super(`Data not found: ${resource}`, 404);
    this.name = "BpsNotFoundError";
  }
}

export class BpsAuthError extends BpsApiError {
  constructor() {
    super("Authentication failed. Check your BPS_API_KEY.", 401);
    this.name = "BpsAuthError";
  }
}

export function formatErrorForUser(error: unknown): string {
  if (error instanceof BpsAuthError) {
    return "Authentication failed. Make sure your BPS_API_KEY is correct. Get an API key at https://webapi.bps.go.id";
  }
  if (error instanceof BpsNotFoundError) {
    return error.message;
  }
  if (error instanceof BpsApiError) {
    return `Error dari BPS API (${error.statusCode ?? "unknown"}): ${error.message}`;
  }
  if (error instanceof Error) {
    return `An error occurred: ${error.message}`;
  }
  return "An unknown error occurred.";
}
