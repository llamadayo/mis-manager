import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));

function createBrowserHarness() {
  const storage = new Map();
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

  const context = {
    console,
    document,
    window: {
      localStorage: {
        getItem(key) {
          return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
          storage.set(key, String(value));
        }
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

  return { appElement, context, storage };
}

test("offline app uses localStorage-backed data flow without fetch", async () => {
  const code = await readFile(appPath, "utf8");
  const { appElement, context, storage } = createBrowserHarness();

  vm.runInContext(`${code}\nglobalThis.__misTest = { api, readStore };`, context);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.match(appElement.innerHTML, /待辦總覽/);
  assert.equal(storage.has("mis-manager.store.v1"), true);

  const api = context.__misTest.api;
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
  const imported = context.__misTest.readStore();
  assert.equal(imported.tasks[0].title, "檢查備份");
});
