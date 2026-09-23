import pg from "pg";

export function createPool(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  // node-postgres emits 'error' on background/idle client failures; without a
  // listener, that becomes an uncaught exception and kills the process. This
  // pool is reused for multi-hour COPY imports, so we must keep the process
  // alive across a transient idle-connection blip.
  pool.on("error", (err) => {
    console.error("pg pool error:", err);
  });
  return pool;
}
