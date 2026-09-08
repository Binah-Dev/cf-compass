const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const writes = new Map();

// Replace only after the complete new document has been flushed. A failed
// replacement leaves the previous document intact and a recoverable temp file.
function writeAtomicJson(target, value, { pretty = true } = {}) {
  const resolved = path.resolve(target);
  const serialized = JSON.stringify(value, null, pretty ? 2 : 0);
  const task = (writes.get(resolved) || Promise.resolve()).catch(() => undefined).then(async () => {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    const temporary = `${resolved}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(temporary, resolved);
        break;
      } catch (error) {
        // Windows readers and antivirus can temporarily deny replacement.
        // Never fall back to truncating the old file to work around that lock.
        if (attempt >= 7 || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(20 * 2 ** attempt, 250)));
      }
    }
  });
  writes.set(resolved, task);
  const cleanup = () => { if (writes.get(resolved) === task) writes.delete(resolved); };
  task.then(cleanup, cleanup);
  return task;
}
module.exports = { writeAtomicJson };
