import { createMisManagerServer } from "./src/http.mjs";

const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = "127.0.0.1";

const server = createMisManagerServer();

server.listen(port, host, () => {
  console.log(`MIS 代辦管理已啟動: http://${host}:${port}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
