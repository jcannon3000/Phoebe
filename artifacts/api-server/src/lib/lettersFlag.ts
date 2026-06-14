/**
 * Letters & Messages — server feature flag (mirror of the client flag at
 * artifacts/mymonastery/src/lib/lettersFlag.ts).
 *
 * When false, the push-notification senders for new letters, letter-reply
 * reminders, and beta messages early-return (no notification is sent). The
 * routes still function, but with the client surfaces hidden no one reaches
 * them. Keep in sync with the client flag.
 */
export const LETTERS_MESSAGES_ENABLED = false;
