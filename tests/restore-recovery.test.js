"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "storage-recovery.js"), "utf8");
const keys = {
  students: "cap-savoir-students-v1",
  attendance: "cap-savoir-attendance-v1",
  operations: "cap-savoir-operations-v1"
};
const journalKey = "cap-savoir-restore-journal-v1";
const emptyOperations = () => ({
  charges: [], payments: [], refunds: [], credits: [], creditApplications: [],
  expenses: [], inflows: [], prospects: [], billingBaselines: []
});

function stores(prefix) {
  return {
    students: JSON.stringify([{ id: `${prefix}-student` }]),
    attendance: JSON.stringify([{ id: `${prefix}-session`, date: "2026-11-10", group: "G1", entries: [] }]),
    operations: JSON.stringify(emptyOperations())
  };
}

function makeEnvironment(seed = {}, options = {}) {
  const data = new Map(Object.entries(seed));
  const writes = [];
  const setCounts = new Map();
  let removeJournalFailures = options.removeJournalFailures || 0;
  let failGet = options.failGet || null;
  const localStorage = {
    getItem(key) {
      if (failGet?.key === key && failGet.skip > 0) {
        failGet.skip--;
      } else if (failGet?.key === key && failGet.remaining > 0) {
        failGet.remaining--;
        throw new Error("simulated readback failure");
      }
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      const count = (setCounts.get(key) || 0) + 1;
      setCounts.set(key, count);
      writes.push({ key, value: String(value), count });
      if (options.quotaJournal && key === journalKey) {
        const error = new Error("quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }
      if (options.failSet?.(key, count, String(value))) throw new Error("simulated write interruption");
      data.set(key, String(value));
    },
    removeItem(key) {
      if (key === journalKey && removeJournalFailures > 0) {
        removeJournalFailures--;
        throw new Error("simulated journal cleanup failure");
      }
      data.delete(key);
    }
  };
  const context = vm.createContext({
    localStorage,
    navigator: options.noLocks ? {} : { locks: { request: async (_name, callback) => callback() } },
    crypto: {
      randomUUID: () => "restore-test-id",
      subtle: { digest: async (_algorithm, bytes) => Uint8Array.from(createHash("sha256").update(Buffer.from(bytes)).digest()).buffer }
    },
    TextEncoder,
    document: { getElementById: () => null },
    console
  });
  vm.runInContext(source, context, { filename: "storage-recovery.js" });
  vm.runInContext("globalThis.__recovery = DataRestoreRecovery", context);
  return { recovery: context.__recovery, data, writes, localStorage };
}

function journal(originals, targets, decision = "ROLLBACK") {
  const payload = { version: 1, id: "crash-simulation", decision, originals, targets };
  const integrity = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return JSON.stringify({ ...payload, integrity });
}

function targetList(values) {
  return Object.entries(keys).map(([name, key]) => ({ name, key, value: values[name] }));
}

test("restore persists and rereads its complete journal before the first registry write", async () => {
  const original = stores("old");
  const target = stores("new");
  const app = makeEnvironment(Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]])));
  await app.recovery.ready;
  await app.recovery.restore(targetList(target), original, () => {});
  const registryWrites = app.writes.filter(write => Object.values(keys).includes(write.key));
  assert.equal(registryWrites.length, 3);
  assert.ok(app.writes.findIndex(write => write.key === journalKey) < app.writes.findIndex(write => Object.values(keys).includes(write.key)));
  assert.deepEqual(Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, app.data.get(key)])), target);
  assert.equal(app.data.has(journalKey), false);
});

test("a quota failure while writing the journal leaves all three registries untouched", async () => {
  const original = stores("old");
  const target = stores("new");
  const app = makeEnvironment(Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]])), { quotaJournal: true });
  await app.recovery.ready;
  await assert.rejects(app.recovery.restore(targetList(target), original, () => {}), /journal.*enregistré/i);
  for (const [name, key] of Object.entries(keys)) assert.equal(app.data.get(key), original[name]);
  assert.equal(app.writes.some(write => Object.values(keys).includes(write.key)), false);
});

test("restart recovery rolls back every simulated pre-commit interruption point", async () => {
  const original = stores("old");
  const target = stores("new");
  for (let writtenCount = 0; writtenCount <= 3; writtenCount++) {
    const seed = Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]]));
    Object.entries(keys).slice(0, writtenCount).forEach(([name, key]) => seed[key] = target[name]);
    seed[journalKey] = journal(original, target, "ROLLBACK");
    const restarted = makeEnvironment(seed);
    await restarted.recovery.ready;
    for (const [name, key] of Object.entries(keys)) assert.equal(restarted.data.get(key), original[name], `rollback point ${writtenCount}, ${name}`);
    assert.equal(restarted.data.has(journalKey), false);
  }
});

test("restart recovery completes the durable commit decision after every interrupted write", async () => {
  const original = stores("old");
  const target = stores("new");
  for (let writtenCount = 0; writtenCount <= 3; writtenCount++) {
    const seed = Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]]));
    Object.entries(keys).slice(0, writtenCount).forEach(([name, key]) => seed[key] = target[name]);
    seed[journalKey] = journal(original, target, "COMMIT!!");
    const restarted = makeEnvironment(seed);
    await restarted.recovery.ready;
    for (const [name, key] of Object.entries(keys)) assert.equal(restarted.data.get(key), target[name], `commit point ${writtenCount}, ${name}`);
    assert.equal(restarted.data.has(journalKey), false);
  }
});

test("restart after all writes but before the commit decision safely restores the originals", async () => {
  const original = stores("old");
  const target = stores("new");
  const seed = Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, target[name]]));
  seed[journalKey] = journal(original, target, "ROLLBACK");
  const restarted = makeEnvironment(seed);
  await restarted.recovery.ready;
  for (const [name, key] of Object.entries(keys)) assert.equal(restarted.data.get(key), original[name]);
  assert.equal(restarted.data.has(journalKey), false);
});

test("a failed write to each registry rolls back and verifies all originals", async () => {
  const original = stores("old");
  const target = stores("new");
  for (const [name, key] of Object.entries(keys)) {
    const seed = Object.fromEntries(Object.entries(keys).map(([storeName, storeKey]) => [storeKey, original[storeName]]));
    const app = makeEnvironment(seed, {
      failSet: (writeKey, count) => writeKey === key && count === 1
    });
    await app.recovery.ready;
    await assert.rejects(
      app.recovery.restore(targetList(target), original, () => {}),
      error => error.code === "RESTORE_ROLLED_BACK",
      `failed target write for ${name}`
    );
    for (const [storeName, storeKey] of Object.entries(keys)) {
      assert.equal(app.data.get(storeKey), original[storeName], `rollback after ${name} failure: ${storeName}`);
    }
    assert.equal(app.data.has(journalKey), false);
  }
});

test("a failed durable commit-decision write rolls back the already written targets", async () => {
  const original = stores("old");
  const target = stores("new");
  const seed = Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]]));
  const app = makeEnvironment(seed, {
    failSet: (key, count, raw) => key === journalKey && count === 2 && JSON.parse(raw).decision === "COMMIT!!"
  });
  await app.recovery.ready;
  await assert.rejects(
    app.recovery.restore(targetList(target), original, () => {}),
    error => error.code === "RESTORE_ROLLED_BACK"
  );
  for (const [name, key] of Object.entries(keys)) assert.equal(app.data.get(key), original[name]);
  assert.equal(app.data.has(journalKey), false);
});

test("a cleanup failure is retried from the committed journal before restore returns", async () => {
  const original = stores("old");
  const target = stores("new");
  const app = makeEnvironment(Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]])), { removeJournalFailures: 1 });
  await app.recovery.ready;
  assert.equal(await app.recovery.restore(targetList(target), original, () => {}), true);
  for (const [name, key] of Object.entries(keys)) assert.equal(app.data.get(key), target[name]);
  assert.equal(app.data.has(journalKey), false);
});

test("a failed final readback rolls back and verifies the original values", async () => {
  const original = stores("old");
  const target = stores("new");
  const app = makeEnvironment(Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]])), {
    failGet: { key: keys.attendance, skip: 1, remaining: 1 }
  });
  await app.recovery.ready;
  await assert.rejects(app.recovery.restore(targetList(target), original, () => {}), error => error.code === "RESTORE_ROLLED_BACK");
  for (const [name, key] of Object.entries(keys)) assert.equal(app.data.get(key), original[name]);
  assert.equal(app.data.has(journalKey), false);
});

test("a malformed journal blocks startup without touching any registry", async () => {
  const original = stores("old");
  const seed = Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]]));
  seed[journalKey] = "not-json";
  const app = makeEnvironment(seed);
  await assert.rejects(app.recovery.ready, error => error.code === "RECOVERY_JOURNAL_INVALID");
  for (const [name, key] of Object.entries(keys)) assert.equal(app.data.get(key), original[name]);
  assert.throws(() => app.recovery.assertReadable(), error => error.code === "RECOVERY_NOT_READY");
});

test("an existing journal cannot be recovered or written without Web Locks", async () => {
  const original = stores("old");
  const target = stores("new");
  const seed = Object.fromEntries(Object.entries(keys).map(([name, key]) => [key, original[name]]));
  seed[journalKey] = journal(original, target);
  const app = makeEnvironment(seed, { noLocks: true });
  await assert.rejects(app.recovery.ready, error => error.code === "RECOVERY_LOCK_UNAVAILABLE");
  for (const [name, key] of Object.entries(keys)) assert.equal(app.data.get(key), original[name]);
});

test("normal mutations fail closed when Web Locks are unavailable", async () => {
  const app = makeEnvironment({}, { noLocks: true });
  await app.recovery.ready;
  await assert.rejects(app.recovery.withLock(() => {}), error => error.code === "RECOVERY_LOCK_UNAVAILABLE");
});
