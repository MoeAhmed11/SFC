// Typed application errors. Route handlers (added later) map these to HTTP
// status codes. Messages are safe to surface and never contain secrets or
// unnecessary personal data.

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT";

export class AppError extends Error {
  readonly code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super("NOT_FOUND", message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input.") {
    super("VALIDATION", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with existing data.") {
    super("CONFLICT", message);
  }
}
