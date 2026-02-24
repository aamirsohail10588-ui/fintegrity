export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class IntegrityError extends AppError {
  constructor(message: string) {
    super(message, 409, "INTEGRITY_VIOLATION");
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string) {
    super(message, 403, "FORBIDDEN");
  }
}
