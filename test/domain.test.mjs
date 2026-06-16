import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  batchUpdateTaskStatus,
  createEngineer,
  createSystem,
  createTask,
  emptyStore,
  isTaskOverdue,
  normalizeStoreShape,
  updateTask
} from "../src/domain.mjs";
import { ensureStoreFile, loadStore, saveStore } from "../src/store.mjs";

function seedStore() {
  let store = emptyStore();
  const systemResult = createSystem(store, { name: "ERP", description: "企業資源系統" }, new Date("2026-06-17T00:00:00Z"));
  store = systemResult.store;
  const engineerResult = createEngineer(store, { name: "Alex", contact: "alex@example.test" }, new Date("2026-06-17T00:00:00Z"));
  store = engineerResult.store;
  return { store, system: systemResult.item, engineer: engineerResult.item };
}

test("store file initializes, saves, and loads normalized JSON", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mis-manager-"));
  const storePath = path.join(dir, "store.json");

  try {
    await ensureStoreFile(storePath);
    const initial = await loadStore(storePath);
    assert.deepEqual(initial, emptyStore());

    const { store } = seedStore();
    await saveStore(storePath, store);
    const loaded = await loadStore(storePath);
    assert.equal(loaded.systems[0].name, "ERP");
    assert.equal(loaded.engineers[0].name, "Alex");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("overdue is derived from due date and open status", () => {
  assert.equal(
    isTaskOverdue({ dueDate: "2026-06-16", status: "待處理" }, "2026-06-17"),
    true
  );
  assert.equal(
    isTaskOverdue({ dueDate: "2026-06-16", status: "已完成" }, "2026-06-17"),
    false
  );
  assert.equal(
    isTaskOverdue({ dueDate: "2026-06-17", status: "進行中" }, "2026-06-17"),
    false
  );
});

test("task updates record status, assignee, and due date history", () => {
  let { store, system, engineer } = seedStore();
  const nextEngineerResult = createEngineer(store, { name: "Jamie", contact: "" }, new Date("2026-06-17T00:00:00Z"));
  store = nextEngineerResult.store;

  const taskResult = createTask(
    store,
    {
      title: "檢查排程",
      systemId: system.id,
      engineerId: engineer.id,
      dueDate: "2026-06-20",
      priority: "高",
      status: "待處理",
      notes: ""
    },
    new Date("2026-06-17T00:00:00Z")
  );
  store = taskResult.store;

  const updateResult = updateTask(
    store,
    taskResult.item.id,
    {
      status: "已完成",
      engineerId: nextEngineerResult.item.id,
      dueDate: "2026-06-21"
    },
    new Date("2026-06-18T00:00:00Z")
  );

  assert.equal(updateResult.item.status, "已完成");
  assert.equal(updateResult.item.completedAt, "2026-06-18T00:00:00.000Z");
  assert.equal(updateResult.history.length, 3);
  assert.deepEqual(
    updateResult.history.map((entry) => entry.field).sort(),
    ["dueDate", "engineerId", "status"]
  );
});

test("batch status update only changes selected tasks and writes history", () => {
  let { store, system, engineer } = seedStore();
  const first = createTask(
    store,
    { title: "第一筆", systemId: system.id, engineerId: engineer.id, dueDate: "2026-06-20", priority: "中" },
    new Date("2026-06-17T00:00:00Z")
  );
  store = first.store;
  const second = createTask(
    store,
    { title: "第二筆", systemId: system.id, engineerId: engineer.id, dueDate: "2026-06-21", priority: "中" },
    new Date("2026-06-17T00:00:00Z")
  );
  store = second.store;

  const result = batchUpdateTaskStatus(store, [first.item.id], "暫緩", new Date("2026-06-18T00:00:00Z"));
  assert.equal(result.changed, 1);
  assert.equal(result.store.tasks.find((task) => task.id === first.item.id).status, "暫緩");
  assert.equal(result.store.tasks.find((task) => task.id === second.item.id).status, "待處理");
  assert.equal(result.history.length, 1);
});

test("import validation rejects invalid references and statuses", () => {
  assert.throws(
    () =>
      normalizeStoreShape({
        systems: [{ id: "sys-1", name: "ERP", active: true }],
        engineers: [{ id: "eng-1", name: "Alex", active: true }],
        tasks: [
          {
            id: "task-1",
            title: "壞資料",
            systemId: "missing",
            engineerId: "eng-1",
            status: "待處理",
            priority: "中",
            dueDate: "2026-06-20"
          }
        ],
        history: []
      }),
    /不存在的系統/
  );

  assert.throws(
    () =>
      normalizeStoreShape({
        systems: [{ id: "sys-1", name: "ERP", active: true }],
        engineers: [{ id: "eng-1", name: "Alex", active: true }],
        tasks: [
          {
            id: "task-1",
            title: "壞狀態",
            systemId: "sys-1",
            engineerId: "eng-1",
            status: "未知",
            priority: "中",
            dueDate: "2026-06-20"
          }
        ],
        history: []
      }),
    /狀態不合法/
  );
});
