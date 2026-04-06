// Anthropic integration removed — functions return static fallbacks

export async function getWelcomeMessage(_ctx: unknown): Promise<string> {
  return "Welcome to your new gathering. Phoebe is here to help you build something lasting.";
}

export async function suggestMeetingTimes(_ritual: unknown): Promise<string[]> {
  return [];
}

export async function getCoordinatorResponse(
  _ctx: unknown,
  _chatHistory: unknown,
  _userMessage: string
): Promise<string> {
  return "The Phoebe assistant is not configured on this server.";
}
