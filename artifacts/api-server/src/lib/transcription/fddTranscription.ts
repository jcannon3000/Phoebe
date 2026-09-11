/**
 * Forward Day by Day audio is NEVER transcribed.
 *
 * Owner decision 2026-09-11: generating text from Forward Movement's audio is
 * the same line the reader keeps for their daily meditations — link and play,
 * never copy. This is a hard switch, independent of OFFICE_TRANSCRIPTION_ENABLED
 * (the cost gate for the daily-office read-aloud alignment), so no Railway
 * env change can turn it back on. Existing rows in fdd_audio_marks keep only
 * timestamps, no transcript text.
 */
export const FDD_TRANSCRIPTION_ENABLED: boolean = false;
