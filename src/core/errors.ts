export class AppError extends Error {
  public readonly module: string;
  public readonly code: string;

  constructor(module: string, code: string, message: string) {
    super(message);
    this.module = module;
    this.code = code;

    Object.setPrototypeOf(this, AppError.prototype);
  }

  public toJSON(): Record<string, string> {
    return {
      module: this.module,
      code: this.code,
      message: this.message,
    };
  }
}
