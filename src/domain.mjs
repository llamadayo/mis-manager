import { randomUUID } from "node:crypto";

export const STORE_VERSION = 1;
export const TASK_STATUSES = Object.freeze(["待處理", "進行中", "已完成", "暫緩", "取消"]);
export const CLOSED_STATUSES = Object.freeze(["已完成", "暫緩", "取消"]);
export const PRIORITIES = Object.freeze(["低", "中", "高", "緊急"]);

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HISTORY_FIELDS = Object.freeze(["status", "engineerId", "dueDate"]);

export function emptyStore() {
  return {
    version: STORE_VERSION,
    systems: [],
    engineers: [],
    tasks: [],
    history: []
  };
}

export function createInputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function toIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

export function todayDateOnly(value = new Date()) {
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateOnly(value) {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isTaskOverdue(task, today = new Date()) {
  return Boolean(
    task?.dueDate &&
      isValidDateOnly(task.dueDate) &&
      !CLOSED_STATUSES.includes(task.status) &&
      task.dueDate < todayDateOnly(today)
  );
}

export function enrichTask(task, store, today = new Date()) {
  const system = store.systems.find((item) => item.id === task.systemId);
  const engineer = store.engineers.find((item) => item.id === task.engineerId);

  return {
    ...task,
    systemName: system?.name ?? "已移除系統",
    engineerName: engineer?.name ?? "已移除工程師",
    overdue: isTaskOverdue(task, today)
  };
}

export function createSystem(store, input, now = new Date()) {
  const timestamp = toIso(now);
  const system = {
    id: randomUUID(),
    name: readText(input.name, "系統名稱", { required: true, max: 80 }),
    description: readText(input.description, "系統描述", { max: 400 }),
    active: readBoolean(input.active, true),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return {
    store: {
      ...store,
      systems: [...store.systems, system]
    },
    item: system
  };
}

export function updateSystem(store, id, input, now = new Date()) {
  const index = findIndexById(store.systems, id, "系統");
  const current = store.systems[index];
  const next = {
    ...current,
    name: input.name === undefined ? current.name : readText(input.name, "系統名稱", { required: true, max: 80 }),
    description:
      input.description === undefined
        ? current.description
        : readText(input.description, "系統描述", { max: 400 }),
    active: input.active === undefined ? current.active : readBoolean(input.active, current.active),
    updatedAt: toIso(now)
  };

  return replaceAt(store, "systems", index, next);
}

export function createEngineer(store, input, now = new Date()) {
  const timestamp = toIso(now);
  const engineer = {
    id: randomUUID(),
    name: readText(input.name, "工程師姓名", { required: true, max: 80 }),
    contact: readText(input.contact, "聯絡資訊", { max: 160 }),
    active: readBoolean(input.active, true),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return {
    store: {
      ...store,
      engineers: [...store.engineers, engineer]
    },
    item: engineer
  };
}

export function updateEngineer(store, id, input, now = new Date()) {
  const index = findIndexById(store.engineers, id, "工程師");
  const current = store.engineers[index];
  const next = {
    ...current,
    name: input.name === undefined ? current.name : readText(input.name, "工程師姓名", { required: true, max: 80 }),
    contact: input.contact === undefined ? current.contact : readText(input.contact, "聯絡資訊", { max: 160 }),
    active: input.active === undefined ? current.active : readBoolean(input.active, current.active),
    updatedAt: toIso(now)
  };

  return replaceAt(store, "engineers", index, next);
}

export function createTask(store, input, now = new Date()) {
  const timestamp = toIso(now);
  const systemId = readText(input.systemId, "所屬系統", { required: true, max: 80 });
  const engineerId = readText(input.engineerId, "指派工程師", { required: true, max: 80 });
  assertActiveReference(store.systems, systemId, "系統");
  assertActiveReference(store.engineers, engineerId, "工程師");

  const status = input.status === undefined ? "待處理" : readStatus(input.status);
  const task = {
    id: randomUUID(),
    title: readText(input.title, "代辦事項", { required: true, max: 160 }),
    notes: readText(input.notes, "備註", { max: 2000 }),
    systemId,
    engineerId,
    status,
    priority: input.priority === undefined ? "中" : readPriority(input.priority),
    dueDate: readDateOnly(input.dueDate, "期限"),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: status === "已完成" ? timestamp : null
  };

  return {
    store: {
      ...store,
      tasks: [...store.tasks, task]
    },
    item: task
  };
}

export function updateTask(store, id, input, now = new Date()) {
  const index = findIndexById(store.tasks, id, "代辦");
  const current = store.tasks[index];
  const timestamp = toIso(now);
  const nextSystemId =
    input.systemId === undefined ? current.systemId : readText(input.systemId, "所屬系統", { required: true, max: 80 });
  const nextEngineerId =
    input.engineerId === undefined
      ? current.engineerId
      : readText(input.engineerId, "指派工程師", { required: true, max: 80 });

  if (nextSystemId !== current.systemId) {
    assertActiveReference(store.systems, nextSystemId, "系統");
  }

  if (nextEngineerId !== current.engineerId) {
    assertActiveReference(store.engineers, nextEngineerId, "工程師");
  }

  const nextStatus = input.status === undefined ? current.status : readStatus(input.status);
  const next = {
    ...current,
    title: input.title === undefined ? current.title : readText(input.title, "代辦事項", { required: true, max: 160 }),
    notes: input.notes === undefined ? current.notes : readText(input.notes, "備註", { max: 2000 }),
    systemId: nextSystemId,
    engineerId: nextEngineerId,
    status: nextStatus,
    priority: input.priority === undefined ? current.priority : readPriority(input.priority),
    dueDate: input.dueDate === undefined ? current.dueDate : readDateOnly(input.dueDate, "期限"),
    updatedAt: timestamp,
    completedAt: resolveCompletedAt(current, nextStatus, timestamp)
  };

  const history = buildHistoryEntries(current, next, timestamp);

  return {
    store: {
      ...store,
      tasks: store.tasks.map((task, taskIndex) => (taskIndex === index ? next : task)),
      history: [...store.history, ...history]
    },
    item: next,
    history
  };
}

export function batchUpdateTaskStatus(store, ids, status, now = new Date()) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw createInputError("請至少選取一筆代辦");
  }

  const nextStatus = readStatus(status);
  const idSet = new Set(ids.map((id) => readText(id, "代辦 ID", { required: true, max: 80 })));
  const missing = [...idSet].filter((id) => !store.tasks.some((task) => task.id === id));

  if (missing.length > 0) {
    throw createInputError(`找不到代辦：${missing.join(", ")}`, 404);
  }

  const timestamp = toIso(now);
  const history = [];
  let changed = 0;

  const tasks = store.tasks.map((task) => {
    if (!idSet.has(task.id) || task.status === nextStatus) {
      return task;
    }

    changed += 1;
    const next = {
      ...task,
      status: nextStatus,
      updatedAt: timestamp,
      completedAt: resolveCompletedAt(task, nextStatus, timestamp)
    };

    history.push(createHistoryEntry(task.id, "status", task.status, nextStatus, timestamp));
    return next;
  });

  return {
    store: {
      ...store,
      tasks,
      history: [...store.history, ...history]
    },
    changed,
    history
  };
}

export function normalizeStoreShape(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw createInputError("匯入資料必須是 JSON 物件");
  }

  const systems = readArray(raw.systems, "systems").map(normalizeSystemRecord);
  const engineers = readArray(raw.engineers, "engineers").map(normalizeEngineerRecord);
  const tasks = readArray(raw.tasks, "tasks").map(normalizeTaskRecord);
  const history = readArray(raw.history, "history").map(normalizeHistoryRecord);

  assertUniqueIds(systems, "systems");
  assertUniqueIds(engineers, "engineers");
  assertUniqueIds(tasks, "tasks");

  const systemIds = new Set(systems.map((item) => item.id));
  const engineerIds = new Set(engineers.map((item) => item.id));
  const taskIds = new Set(tasks.map((item) => item.id));

  for (const task of tasks) {
    if (!systemIds.has(task.systemId)) {
      throw createInputError(`代辦「${task.title}」參照不存在的系統`);
    }

    if (!engineerIds.has(task.engineerId)) {
      throw createInputError(`代辦「${task.title}」參照不存在的工程師`);
    }
  }

  for (const entry of history) {
    if (!taskIds.has(entry.taskId)) {
      throw createInputError("歷程紀錄參照不存在的代辦");
    }
  }

  return {
    version: STORE_VERSION,
    systems,
    engineers,
    tasks,
    history
  };
}

function buildHistoryEntries(before, after, timestamp) {
  return HISTORY_FIELDS.flatMap((field) => {
    if (before[field] === after[field]) {
      return [];
    }

    return [createHistoryEntry(after.id, field, before[field] ?? "", after[field] ?? "", timestamp)];
  });
}

function createHistoryEntry(taskId, field, before, after, timestamp) {
  return {
    id: randomUUID(),
    taskId,
    field,
    before,
    after,
    changedAt: timestamp,
    actor: "local"
  };
}

function resolveCompletedAt(current, nextStatus, timestamp) {
  if (nextStatus === "已完成") {
    return current.status === "已完成" ? current.completedAt ?? timestamp : timestamp;
  }

  return null;
}

function replaceAt(store, key, index, item) {
  return {
    store: {
      ...store,
      [key]: store[key].map((current, currentIndex) => (currentIndex === index ? item : current))
    },
    item
  };
}

function assertActiveReference(records, id, label) {
  const record = records.find((item) => item.id === id);

  if (!record) {
    throw createInputError(`找不到${label}`);
  }

  if (!record.active) {
    throw createInputError(`${label}已停用，不能用於新的指派`);
  }
}

function findIndexById(records, id, label) {
  const index = records.findIndex((item) => item.id === id);

  if (index === -1) {
    throw createInputError(`找不到${label}`, 404);
  }

  return index;
}

function readText(value, label, options = {}) {
  const { required = false, max = 500 } = options;
  const text = typeof value === "string" ? value.trim() : "";

  if (required && text.length === 0) {
    throw createInputError(`${label}為必填`);
  }

  if (text.length > max) {
    throw createInputError(`${label}不可超過 ${max} 個字`);
  }

  return text;
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return value === true || value === "true" || value === "on";
}

function readStatus(value) {
  const status = readText(value, "狀態", { required: true, max: 20 });

  if (!TASK_STATUSES.includes(status)) {
    throw createInputError("狀態不合法");
  }

  return status;
}

function readPriority(value) {
  const priority = readText(value, "優先級", { required: true, max: 20 });

  if (!PRIORITIES.includes(priority)) {
    throw createInputError("優先級不合法");
  }

  return priority;
}

function readDateOnly(value, label) {
  const text = readText(value, label, { required: true, max: 10 });

  if (!isValidDateOnly(text)) {
    throw createInputError(`${label}格式必須為 YYYY-MM-DD`);
  }

  return text;
}

function readArray(value, label) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createInputError(`${label} 必須是陣列`);
  }

  return value;
}

function assertUniqueIds(records, label) {
  const ids = new Set();

  for (const record of records) {
    if (ids.has(record.id)) {
      throw createInputError(`${label} 含有重複 ID`);
    }

    ids.add(record.id);
  }
}

function normalizeSystemRecord(record) {
  return {
    id: readText(record.id, "系統 ID", { required: true, max: 80 }),
    name: readText(record.name, "系統名稱", { required: true, max: 80 }),
    description: readText(record.description, "系統描述", { max: 400 }),
    active: readBoolean(record.active, true),
    createdAt: readText(record.createdAt, "建立時間", { max: 40 }),
    updatedAt: readText(record.updatedAt, "更新時間", { max: 40 })
  };
}

function normalizeEngineerRecord(record) {
  return {
    id: readText(record.id, "工程師 ID", { required: true, max: 80 }),
    name: readText(record.name, "工程師姓名", { required: true, max: 80 }),
    contact: readText(record.contact, "聯絡資訊", { max: 160 }),
    active: readBoolean(record.active, true),
    createdAt: readText(record.createdAt, "建立時間", { max: 40 }),
    updatedAt: readText(record.updatedAt, "更新時間", { max: 40 })
  };
}

function normalizeTaskRecord(record) {
  return {
    id: readText(record.id, "代辦 ID", { required: true, max: 80 }),
    title: readText(record.title, "代辦事項", { required: true, max: 160 }),
    notes: readText(record.notes, "備註", { max: 2000 }),
    systemId: readText(record.systemId, "所屬系統", { required: true, max: 80 }),
    engineerId: readText(record.engineerId, "指派工程師", { required: true, max: 80 }),
    status: readStatus(record.status),
    priority: readPriority(record.priority),
    dueDate: readDateOnly(record.dueDate, "期限"),
    createdAt: readText(record.createdAt, "建立時間", { max: 40 }),
    updatedAt: readText(record.updatedAt, "更新時間", { max: 40 }),
    completedAt: record.completedAt === null ? null : readText(record.completedAt, "完成時間", { max: 40 })
  };
}

function normalizeHistoryRecord(record) {
  const field = readText(record.field, "歷程欄位", { required: true, max: 40 });

  if (!HISTORY_FIELDS.includes(field)) {
    throw createInputError("歷程欄位不合法");
  }

  return {
    id: readText(record.id, "歷程 ID", { required: true, max: 80 }),
    taskId: readText(record.taskId, "代辦 ID", { required: true, max: 80 }),
    field,
    before: readText(String(record.before ?? ""), "變更前", { max: 200 }),
    after: readText(String(record.after ?? ""), "變更後", { max: 200 }),
    changedAt: readText(record.changedAt, "變更時間", { required: true, max: 40 }),
    actor: readText(record.actor, "變更者", { max: 40 }) || "local"
  };
}
