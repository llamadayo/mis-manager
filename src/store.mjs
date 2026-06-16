import fs from "node:fs/promises";
import path from "node:path";
import { emptyStore, normalizeStoreShape } from "./domain.mjs";

export async function ensureStoreFile(storePath) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });

  try {
    await fs.access(storePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    await saveStore(storePath, emptyStore());
  }
}

export async function loadStore(storePath) {
  await ensureStoreFile(storePath);
  const content = await fs.readFile(storePath, "utf8");
  const parsed = JSON.parse(content);
  return normalizeStoreShape(parsed);
}

export async function saveStore(storePath, store) {
  const normalized = normalizeStoreShape(store);
  await fs.mkdir(path.dirname(storePath), { recursive: true });

  const tempPath = `${storePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const content = `${JSON.stringify(normalized, null, 2)}\n`;

  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, storePath);
  return normalized;
}

export function createStoreRepository(storePath) {
  let queue = Promise.resolve();

  return {
    storePath,
    async init() {
      await ensureStoreFile(storePath);
    },
    async read() {
      return loadStore(storePath);
    },
    async update(mutator) {
      const operation = queue.then(async () => {
        const current = await loadStore(storePath);
        const mutation = await mutator(current);

        if (!mutation?.store) {
          throw new Error("Store mutation must return an object with a store property");
        }

        await saveStore(storePath, mutation.store);
        return mutation;
      });

      queue = operation.catch(() => {});
      return operation;
    }
  };
}
