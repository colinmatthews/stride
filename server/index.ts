import "dotenv/config";
import { createApp } from "./app.js";
import { initializeDatabase } from "./db.js";

const port = Number(process.env.PORT ?? 3001);

async function start() {
  await initializeDatabase();

  const app = createApp();

  app.listen(port, () => {
    console.log(`Stride server listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
