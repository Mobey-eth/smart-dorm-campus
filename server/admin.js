import Database from "better-sqlite3";
const username = process.argv[2];
if (!username) {
  console.error("Usage: node server/admin.js <existing-username>");
  process.exit(1);
}
const db = new Database(process.env.DB_PATH || "./data/smartdorm.sqlite");
const result = db
  .prepare("UPDATE users SET role='admin' WHERE username=?")
  .run(username.toLowerCase());
console.log(
  result.changes
    ? "Administrator role granted."
    : "Account not found. Register the account first.",
);
db.close();
