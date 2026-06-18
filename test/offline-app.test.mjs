import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));

function createBrowserHarness() {
  const legacyStorage = new Map();
  const indexedRecords = new Map();
  const backupWrites = [];
  const appElement = { className: "", innerHTML: "" };
  const document = {
    querySelector(selector) {
      return selector === "#app" ? appElement : null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return { click() {} };
    }
  };

  class BlobStub {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
    }
  }

  function requestSuccess(request, value) {
    setTimeout(() => {
      request.result = value;
      request.onsuccess?.();
    }, 0);
    return request;
  }

  function createTransaction() {
    const transaction = {
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore() {
        return {
          get(key) {
            return requestSuccess({}, indexedRecords.has(key) ? { key, value: indexedRecords.get(key) } : undefined);
          },
          put(record) {
            indexedRecords.set(record.key, record.value);
            const request = requestSuccess({}, record.key);
            setTimeout(() => transaction.oncomplete?.(), 1);
            return request;
          }
        };
      }
    };
    return transaction;
  }

  const indexedDB = {
    open() {
      const database = {
        objectStoreNames: {
          contains() {
            return true;
          }
        },
        createObjectStore() {},
        transaction() {
          return createTransaction();
        }
      };
      const request = {};
      setTimeout(() => {
        request.result = database;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    }
  };

  const backupHandle = {
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
    async createWritable() {
      return {
        async write(content) {
          backupWrites.push(content);
        },
        async close() {}
      };
    }
  };

  const context = {
    console,
    document,
    window: {
      localStorage: {
        getItem(key) {
          return legacyStorage.has(key) ? legacyStorage.get(key) : null;
        },
        setItem(key, value) {
          legacyStorage.set(key, String(value));
        }
      },
      indexedDB,
      async showSaveFilePicker() {
        return backupHandle;
      },
      crypto: {
        randomUUID() {
          return `test-${Math.random().toString(36).slice(2, 10)}`;
        }
      },
      clearTimeout,
      setTimeout,
      confirm() {
        return true;
      }
    },
    setTimeout,
    clearTimeout,
    Blob: BlobStub,
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {}
    },
    Date,
    Intl,
    JSON,
    Math,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Promise,
    decodeURIComponent,
    encodeURIComponent
  };
  context.globalThis = context;
  vm.createContext(context);

  return { appElement, backupWrites, context, indexedRecords, legacyStorage };
}

test("offline app uses IndexedDB-backed data flow with JSON backup files", async () => {
  const code = await readFile(appPath, "utf8");
  const { appElement, backupWrites, context, indexedRecords } = createBrowserHarness();

  vm.runInContext(`${code}\nglobalThis.__misTest = { api, readStore, chooseBackupFile };`, context);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.match(appElement.innerHTML, /待辦總覽/);
  assert.equal(indexedRecords.has("store"), true);

  const api = context.__misTest.api;
  await context.__misTest.chooseBackupFile();
  const system = (
    await api("/api/systems", {
      method: "POST",
      body: { name: "ERP", description: "企業資源系統", active: true }
    })
  ).system;
  const engineer = (
    await api("/api/engineers", {
      method: "POST",
      body: { name: "Alex", contact: "alex@example.test", active: true }
    })
  ).engineer;
  const task = (
    await api("/api/tasks", {
      method: "POST",
      body: {
        title: "檢查備份",
        systemId: system.id,
        engineerId: engineer.id,
        dueDate: "2026-06-20",
        priority: "高",
        status: "待處理",
        notes: "離線流程測試"
      }
    })
  ).task;

  await api(`/api/tasks/${encodeURIComponent(task.id)}`, {
    method: "PUT",
    body: { status: "進行中", dueDate: "2026-06-21" }
  });
  await api("/api/tasks/batch-status", {
    method: "POST",
    body: { ids: [task.id], status: "已完成" }
  });

  const exported = await api("/api/export");
  assert.equal(exported.systems.length, 1);
  assert.equal(exported.engineers.length, 1);
  assert.equal(exported.tasks.length, 1);
  assert.equal(exported.tasks[0].status, "已完成");
  assert.equal(exported.history.length, 3);

  await api("/api/import", { method: "POST", body: exported });
  const imported = await context.__misTest.readStore();
  assert.equal(imported.tasks[0].title, "檢查備份");
  assert.ok(backupWrites.length >= 2);
  assert.match(backupWrites.at(-1), /檢查備份/);
});

test("offline app migrates existing localStorage data into IndexedDB", async () => {
  const code = await readFile(appPath, "utf8");
  const { context, indexedRecords, legacyStorage } = createBrowserHarness();

  legacyStorage.set(
    "mis-manager.store.v1",
    JSON.stringify({
      version: 1,
      systems: [
        {
          id: "sys-legacy",
          name: "Legacy ERP",
          description: "",
          active: true,
          createdAt: "2026-06-19T00:00:00.000Z",
          updatedAt: "2026-06-19T00:00:00.000Z"
        }
      ],
      engineers: [],
      tasks: [],
      history: []
    })
  );

  vm.runInContext(`${code}\nglobalThis.__misTest = { readStore };`, context);
  await new Promise((resolve) => setTimeout(resolve, 20));

  const migrated = await context.__misTest.readStore();
  assert.equal(migrated.systems[0].name, "Legacy ERP");
  assert.equal(indexedRecords.get("store").systems[0].id, "sys-legacy");
});
