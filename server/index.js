import { createApp } from "./app.js";
const { app, close } = createApp({
  dbPath: process.env.DB_PATH || "./data/smartdorm.sqlite",
});
const server = app.listen(
  Number(process.env.PORT || 3015),
  process.env.HOST || "127.0.0.1",
  () => console.log(`Smartdorm running on port ${process.env.PORT || 3015}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      close();
      process.exit(0);
    }),
  );
