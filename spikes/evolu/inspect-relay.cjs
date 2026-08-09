const Database = require("better-sqlite3");
const db = new Database("/app/data/evolu-relay.db", { readonly: true });

const tables = db
  .prepare("select name from sqlite_master where type='table'")
  .all()
  .map((t) => t.name);
console.log("TABLES: " + tables.join(", "));

for (const name of tables) {
  const cols = db
    .prepare("select * from pragma_table_info(?)")
    .all(name)
    .map((c) => c.name + ":" + c.type);
  const count = db.prepare('select count(*) as c from "' + name + '"').get().c;
  console.log("\n" + name + "  (" + count + " rows)");
  console.log("  columns: " + cols.join(", "));

  const row = db.prepare('select * from "' + name + '" limit 1').get();
  if (!row) continue;
  for (const [k, v] of Object.entries(row)) {
    const shown = Buffer.isBuffer(v)
      ? "BLOB[" + v.length + " bytes] " + v.subarray(0, 32).toString("hex") + "..."
      : String(v).slice(0, 70);
    console.log("    " + k + " = " + shown);
  }
}
