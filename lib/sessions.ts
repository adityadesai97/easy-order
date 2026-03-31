import type { Session } from "./types";

const KEY = "easy-order-sessions";
const MAX = 10;

export function loadSessions(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Session[];
  } catch {
    return [];
  }
}

export function saveSession(session: Session): void {
  const rest = loadSessions().filter((s) => s.id !== session.id);
  rest.unshift(session);
  localStorage.setItem(KEY, JSON.stringify(rest.slice(0, MAX)));
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(sessions));
}
