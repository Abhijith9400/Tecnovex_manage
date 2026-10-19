import type { Tx } from "../db/prisma";

/**
 * Atomically reserves the next number for a key. Must run inside the same transaction that saves the
 * document; the row lock taken by the upsert serialises concurrent callers so numbers never repeat.
 */
export async function nextSequence(tx: Tx, key: string): Promise<number> {
  const row = await tx.numberSequence.upsert({
    where: { key },
    create: { key, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  return row.nextValue - 1;
}
