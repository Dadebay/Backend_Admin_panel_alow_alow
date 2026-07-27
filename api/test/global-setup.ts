import { execFileSync } from "node:child_process";
import { Client } from "pg";

const TEST_DATABASE = "alofood_test";
const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_ADMIN_URL ??
  "postgresql://alofood:alofood@localhost:5432/alofood";
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://alofood:alofood@localhost:5432/${TEST_DATABASE}`;

async function recreateTestDatabase() {
  const client = new Client({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TEST_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  } finally {
    await client.end();
  }
}

async function dropTestDatabase() {
  const client = new Client({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TEST_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
  } finally {
    await client.end();
  }
}

export async function setup() {
  await recreateTestDatabase();
  execFileSync("npm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
    },
    stdio: "pipe",
  });

  return async () => {
    await dropTestDatabase();
  };
}
