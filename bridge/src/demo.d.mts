// Types for the demo module when the browser imports it directly (static demo build).
export interface DemoSession {
  handle(msg: Record<string, unknown>): void;
  close(): void;
}
export function createDemoSession(
  opts: Record<string, unknown>,
  send: (msg: Record<string, unknown>) => void,
): DemoSession;
