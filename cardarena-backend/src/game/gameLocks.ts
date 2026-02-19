const gameLocks = new Set<string>();

const LOCK_WAIT_MS = 20;
const LOCK_MAX_WAIT_MS = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withGameLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
  let waited = 0;
  while (gameLocks.has(gameId) && waited < LOCK_MAX_WAIT_MS) {
    await sleep(LOCK_WAIT_MS);
    waited += LOCK_WAIT_MS;
  }

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
