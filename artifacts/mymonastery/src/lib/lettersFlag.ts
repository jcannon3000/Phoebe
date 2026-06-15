/**
 * Letters & Messages — feature flag (client mirror of the server flag at
 * artifacts/api-server/src/lib/lettersFlag.ts).
 *
 * When false (the current default), the Letters and Messages features are
 * turned OFF everywhere a user can reach them: no home cards, no menu entries,
 * no "write a letter" / "send a message" CTAs, and the server sends no
 * letter/message push notifications. The routes still exist but nothing
 * surfaces them, so the feature is effectively dormant — flip this (and the
 * server mirror) back to true to bring it back wholesale.
 *
 * Keep this in sync with the server flag.
 */
export const LETTERS_MESSAGES_ENABLED = true;
