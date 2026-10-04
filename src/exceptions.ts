export class FragmentError extends Error {
  /*
   * Preserve the concrete exception name and the original failure cause.
   *
   * Library callers can catch FragmentError at their application boundary,
   * while payment integrations should handle BroadcastUncertainError before
   * broader transaction or library error categories.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ClientError extends FragmentError {}
export class ConfigurationError extends ClientError {}
export { ConfigurationError as ConfigError };
export class CookieError extends ClientError {}
export class FragmentAPIError extends FragmentError {}
export class FragmentPageError extends FragmentAPIError {
  constructor(
    message: string,
    public readonly status?: number,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}
export class UserNotFoundError extends FragmentAPIError {}
export class ChannelNotFoundError extends UserNotFoundError {}
export class AlreadySubscribedError extends FragmentAPIError {}
export class AnonymousNumberError extends FragmentAPIError {}
export class PaidMessageLimitError extends FragmentAPIError {}
export class VerificationError extends FragmentAPIError {}
export class ParseError extends FragmentAPIError {}
export class TransactionError extends FragmentAPIError {}
export class ConfirmationTimeout extends TransactionError {}
export class SeqnoError extends TransactionError {}
export class OperationError extends FragmentError {}
export class WalletError extends OperationError {}
export class UnexpectedError extends OperationError {}
export class RetryExhaustedError extends OperationError {}
export class SessionStorageError extends OperationError {}

export class BroadcastUncertainError extends TransactionError {
  /*
   * Carry reconciliation identifiers without embedding a signed BOC.
   *
   * A failed network request after submission does not establish rejection.
   * Consumers must retain the original invoice and inspect its outcome before
   * authorizing another payment, even when no transaction hash is available.
   */
  constructor(
    message: string,
    public readonly reqId: string = "",
    public readonly txHash: string = "",
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

/*
 * Substitute named placeholders without interpreting replacement strings.
 *
 * Callback-based replacement preserves dollar signs in supplied values and
 * avoids constructing regular expressions from caller-controlled key names.
 */
export function fmt(
  template: string,
  parameters: Record<string, unknown>
): string {
  return template.replace(/\{([^{}]+)\}/g, (match, key: string) =>
    Object.hasOwn(parameters, key) ? String(parameters[key]) : match
  );
}