// ONE POP-UP PER APP OPEN. The weekly invitations (create an account, turn on
// notifications) are both modals over the home; two in one launch is a pile-on.
// The first to ask claims the slot for this session and the other waits for the
// next visit - which is why each stamps its own week only when it actually shows.
const KEY = "phoebe:nudge-slot-taken";
export function claimNudgeSlot(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, "1");
    return true;
  } catch {
    return true; // storage blocked: allow it; each nudge's own weekly stamp still limits it
  }
}
