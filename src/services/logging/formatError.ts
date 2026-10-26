export function formatError(error: unknown): string {
  const value = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack?.replace(/[\r\n]+/g, ' | ') }
    : { name: 'UnknownError', message: String(error) };
  return JSON.stringify(value);
}
