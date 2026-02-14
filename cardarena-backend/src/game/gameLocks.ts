const gameLocks = new Set<string>();

export async function withGameLock<T>(
  gameId: string,
  fn: () => Promise<T>
): Promise<T> {
  if (gameLocks.has(gameId)) {
    throw new Error("Game action already in progress");
  }

  gameLocks.add(gameId);

  try {
    return await fn();
  } finally {
    gameLocks.delete(gameId);
  }
}
