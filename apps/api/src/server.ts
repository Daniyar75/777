import { createDb, createPool } from "@network-crm/database";
import { buildApp } from "./app.js";
import { loadConfig } from "./env.js";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const db = createDb(pool);

const provisioningKey = process.env.PLATFORM_PROVISIONING_KEY;
if (!provisioningKey) {
  throw new Error("PLATFORM_PROVISIONING_KEY is required (guards POST /tenants, see routes/tenants.ts)");
}

const app = buildApp({ db, jwtSecret: config.jwtSecret, provisioningKey });

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`apps/api listening on :${config.port}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
