import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  batchUpdateTaskStatus,
  createEngineer,
  createSystem,
  createTask,
  enrichTask,
  normalizeStoreShape,
  updateEngineer,
  updateSystem,
  updateTask
} from "./domain.mjs";
import { createStoreRepository } from "./store.mjs";

const defaultPublicDir = fileURLToPath(new URL("../public/", import.meta.url));
const defaultStorePath = fileURLToPath(new URL("../data/store.json", import.meta.url));

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

export function createMisManagerServer(options = {}) {
  const publicDir = options.publicDir ?? defaultPublicDir;
  const repository = createStoreRepository(options.storePath ?? defaultStorePath);
  const ready = repository.init();

  return http.createServer(async (request, response) => {
    try {
      await ready;
      const requestUrl = new URL(request.url ?? "/", "http://localhost");

      if (requestUrl.pathname.startsWith("/api/")) {
        await handleApi(request, response, requestUrl, repository);
        return;
      }

      await serveStatic(response, requestUrl.pathname, publicDir);
    } catch (error) {
      sendError(response, error);
    }
  });
}

async function handleApi(request, response, requestUrl, repository) {
  const { method } = request;
  const pathname = requestUrl.pathname;

  if (method === "GET" && pathname === "/api/tasks") {
    const store = await repository.read();
    sendJson(response, 200, {
      tasks: store.tasks.map((task) => enrichTask(task, store)),
      history: store.history
    });
    return;
  }

  if (method === "POST" && pathname === "/api/tasks") {
    const body = await readJsonBody(request);
    const mutation = await repository.update((store) => createTask(store, body));
    const store = await repository.read();
    sendJson(response, 201, { task: enrichTask(mutation.item, store) });
    return;
  }

  if (method === "PUT" && (pathname === "/api/tasks" || pathname.startsWith("/api/tasks/"))) {
    const body = await readJsonBody(request);
    const id = pathname === "/api/tasks" ? body.id : decodeURIComponent(pathname.slice("/api/tasks/".length));
    const mutation = await repository.update((store) => updateTask(store, id, body));
    const store = await repository.read();
    sendJson(response, 200, { task: enrichTask(mutation.item, store), history: mutation.history });
    return;
  }

  if (method === "POST" && pathname === "/api/tasks/batch-status") {
    const body = await readJsonBody(request);
    const mutation = await repository.update((store) => batchUpdateTaskStatus(store, body.ids, body.status));
    const store = await repository.read();
    sendJson(response, 200, {
      changed: mutation.changed,
      tasks: store.tasks.map((task) => enrichTask(task, store)),
      history: store.history
    });
    return;
  }

  if (method === "GET" && pathname === "/api/systems") {
    const store = await repository.read();
    sendJson(response, 200, { systems: store.systems });
    return;
  }

  if (method === "POST" && pathname === "/api/systems") {
    const body = await readJsonBody(request);
    const mutation = await repository.update((store) => createSystem(store, body));
    sendJson(response, 201, { system: mutation.item });
    return;
  }

  if (method === "PUT" && (pathname === "/api/systems" || pathname.startsWith("/api/systems/"))) {
    const body = await readJsonBody(request);
    const id = pathname === "/api/systems" ? body.id : decodeURIComponent(pathname.slice("/api/systems/".length));
    const mutation = await repository.update((store) => updateSystem(store, id, body));
    sendJson(response, 200, { system: mutation.item });
    return;
  }

  if (method === "GET" && pathname === "/api/engineers") {
    const store = await repository.read();
    sendJson(response, 200, { engineers: store.engineers });
    return;
  }

  if (method === "POST" && pathname === "/api/engineers") {
    const body = await readJsonBody(request);
    const mutation = await repository.update((store) => createEngineer(store, body));
    sendJson(response, 201, { engineer: mutation.item });
    return;
  }

  if (method === "PUT" && (pathname === "/api/engineers" || pathname.startsWith("/api/engineers/"))) {
    const body = await readJsonBody(request);
    const id =
      pathname === "/api/engineers" ? body.id : decodeURIComponent(pathname.slice("/api/engineers/".length));
    const mutation = await repository.update((store) => updateEngineer(store, id, body));
    sendJson(response, 200, { engineer: mutation.item });
    return;
  }

  if (method === "GET" && pathname === "/api/export") {
    const store = await repository.read();
    sendJson(response, 200, store, {
      "Content-Disposition": `attachment; filename="mis-manager-backup-${new Date().toISOString().slice(0, 10)}.json"`
    });
    return;
  }

  if (method === "POST" && pathname === "/api/import") {
    const body = await readJsonBody(request, 2_000_000);
    const imported = normalizeStoreShape(body);
    await repository.update(() => ({ store: imported }));
    const store = await repository.read();
    sendJson(response, 200, {
      systems: store.systems,
      engineers: store.engineers,
      tasks: store.tasks.map((task) => enrichTask(task, store)),
      history: store.history
    });
    return;
  }

  sendJson(response, 404, { error: "找不到 API" });
}

async function readJsonBody(request, limit = 1_000_000) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("JSON 內容過大");
      error.status = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("JSON 格式不合法");
    error.status = 400;
    throw error;
  }
}

async function serveStatic(response, pathname, publicDir) {
  const decodedPath = decodeURIComponent(pathname);
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const normalized = path.normalize(requestedPath).replace(/^([/\\])+/, "");
  const filePath = path.join(publicDir, normalized);
  const relative = path.relative(publicDir, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      const indexPath = path.join(publicDir, "index.html");
      const content = await fs.readFile(indexPath);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(content);
      return;
    }

    throw error;
  }
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message = status === 500 ? "伺服器發生錯誤" : error.message;

  if (status === 500) {
    console.error(error);
  }

  sendJson(response, status, { error: message });
}
