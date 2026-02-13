/**
 * Processes text input before sending to the agent.
 * Currently a passthrough — future: voice transcription, text cleanup, etc.
 */
export function processTextInput(text: string): string {
  return text.trim()
}
