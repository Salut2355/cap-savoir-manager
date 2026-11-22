"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const recoverySource = fs.readFileSync(
  path.join(root, "js", "storage-recovery.js"),
  "utf8"
);
const studentsSource = fs.readFileSync(
  path.join(root, "js", "students.js"),
  "utf8"
);
const attendanceSource = fs.readFileSync(
  path.join(root, "js", "attendance.js"),
  "utf8"
);
const operationsSource = fs.readFileSync(
  path.join(root, "js", "operations.js"),
  "utf8"
);

function createHarness(options = {}) {
  const values = new Map(Object.entries(options.initialValues || {}));
  const writes = [];
  const elements = new Map();
  let denyReads = false;
  let denyWrites = false;

  const localStorage = {
    getItem(key) {
      if (denyReads) throw new Error("Simulated storage read denial");
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      writes.push({ key, value });
      if (denyWrites) throw new Error("Simulated storage write denial");
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };

  const document = {
    addEventListener() {},
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === ".attendance-status") return options.statuses || [];
      if (selector === ".attendance-reason") return options.reasons || [];
      return [];
    }
  };

  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    localStorage,
    navigator: { locks: { request: async (_name, callback) => callback() } },
    document,
    crypto: {
      randomUUID: () => "test-uuid",
      subtle: { digest: async (_algorithm, bytes) => Uint8Array.from(createHash("sha256").update(Buffer.from(bytes)).digest()).buffer }
    },
    TextEncoder,
    confirm: () => true,
    alert() {},
    URL,
    Blob,
    setTimeout,
    FormData: class {},
    Date,
    Map,
    Set,
    Array,
    JSON,
    Error,
    TypeError
  });

  vm.runInContext(recoverySource, context, { filename: "storage-recovery.js" });
  vm.runInContext(studentsSource, context, { filename: "students.js" });
  vm.runInContext(attendanceSource, context, { filename: "attendance.js" });
  vm.runInContext(operationsSource, context, { filename: "operations.js" });
  vm.runInContext(
    "globalThis.__students = StudentManager; globalThis.__attendance = AttendanceManager; globalThis.__operations = OperationsManager;",
    context
  );

  return {
    context,
    students: context.__students,
    attendance: context.__attendance,
    operations: context.__operations,
    values,
    writes,
    elements,
    denyReads(value = true) { denyReads = value; },
    denyWrites(value = true) { denyWrites = value; }
  };
}

test("absent keys are empty in memory without automatic writes", () => {
  const harness = createHarness();

  assert.deepEqual(Array.from(harness.students.getAll()), []);
  assert.deepEqual(Array.from(harness.attendance.getAll()), []);
  assert.equal(Object.keys(harness.operations.getAll()).length, 9);
  assert.equal(harness.writes.length, 0);
  assert.equal(harness.students.saveAll, undefined);
  assert.equal(harness.attendance.saveAll, undefined);
  assert.equal(harness.operations.saveAll, undefined);
});

test("invalid operations data is not interpreted as an empty ledger", () => {
  const key = "cap-savoir-operations-v1";
  const raw = "{";
  const harness = createHarness({ initialValues: { [key]: raw } });
  assert.throws(
    () => harness.operations.getAll(),
    error => error.code === "STORAGE_INVALID_JSON"
  );
  assert.equal(harness.writes.length, 0);
  assert.equal(harness.values.get(key), raw);
});

for (const [label, raw, expectedCode] of [
  ["empty strings", "", "STORAGE_EMPTY"],
  ["invalid JSON", "{", "STORAGE_INVALID_JSON"],
  ["non-array JSON roots", "{\"student\":true}", "STORAGE_INVALID_ROOT"]
]) {
  test(`student writes stop on ${label}`, async () => {
    const key = "cap-savoir-students-v1";
    const harness = createHarness({ initialValues: { [key]: raw } });

    await assert.rejects(
      harness.students.add({
        name: "Élève test",
        parent: "Responsable",
        phone: "00000000",
        level: "CP1",
        group: "G1",
        startDate: "2026-11-01"
      }),
      error => error.code === expectedCode
    );
    assert.equal(harness.writes.length, 0);
    assert.equal(harness.values.get(key), raw);
  });
}

for (const operation of [
  ["update", manager => manager.update("s1", {
    name: "Nom", parent: "Parent", phone: "00000000",
    level: "CP1", group: "G1", startDate: "2026-11-01"
  })],
  ["archive", manager => manager.setArchived("s1", true)]
]) {
  test(`student ${operation[0]} does not write after a read error`, async () => {
    const key = "cap-savoir-students-v1";
    const raw = "not-json";
    const harness = createHarness({ initialValues: { [key]: raw } });
    await assert.rejects(
      operation[1](harness.students),
      error => error.code === "STORAGE_INVALID_JSON"
    );
    assert.equal(harness.writes.length, 0);
    assert.equal(harness.values.get(key), raw);
  });
}

test("inaccessible student storage does not lead to a write", async () => {
  const harness = createHarness();
  harness.denyReads();

  await assert.rejects(
    harness.students.add({
      name: "Élève test",
      parent: "Responsable",
      phone: "00000000",
      level: "CP1",
      group: "G1",
      startDate: "2026-11-01"
    }),
    error => ["STORAGE_ACCESS", "RECOVERY_STORAGE_ACCESS"].includes(error.code)
  );
  assert.equal(harness.writes.length, 0);
});

test("direct writes are not exposed and private commits require an array", () => {
  const harness = createHarness();
  assert.equal(harness.students.saveAll, undefined);
  assert.equal(harness.attendance.saveAll, undefined);
});

test("normal student add writes and verifies one complete array", async () => {
  const key = "cap-savoir-students-v1";
  const harness = createHarness({
    initialValues: { [key]: JSON.stringify([{ id: "existing" }]) }
  });

  await harness.students.add({
    name: "Nouvel élève",
    parent: "Responsable",
    phone: "00000000",
    level: "CP1",
    group: "G1",
    startDate: "2026-11-01"
  });

  assert.equal(harness.writes.length, 1);
  const saved = JSON.parse(harness.values.get(key));
  assert.deepEqual(saved.map(item => item.id), ["existing", "test-uuid"]);
});

test("student tariff changes are date-stamped and enrollment terms stay anchored", async () => {
  const key = "cap-savoir-students-v1";
  const original = {
    id: "s1", name: "Élève", level: "CP2", parent: "Parent", phone: "00000000",
    group: "G1", startDate: "2026-01-31", createdAt: "2026-01-01T00:00:00.000Z",
    archived: false, archivedAt: null, registrationExempted: true,
    levelHistory: [{ level: "CP2", effectiveFrom: "2026-01-31" }], billingHistoryVerified: true
  };
  const harness = createHarness({ initialValues: { [key]: JSON.stringify([original]) } });
  await harness.students.update("s1", {
    name: "Élève", level: "6e", parent: "Parent", phone: "00000000",
    group: "G2", startDate: "2026-02-01", registrationExempted: false
  });
  const saved = JSON.parse(harness.values.get(key))[0];
  assert.equal(saved.startDate, original.startDate);
  assert.equal(saved.registrationExempted, true);
  assert.equal(saved.level, "6e");
  assert.deepEqual(saved.levelHistory.map(item => item.level), ["CP2", "6e"]);
});

test("attendance schedule follows the configured group weekdays", () => {
  const harness = createHarness();
  assert.equal(harness.attendance.isScheduledGroupDay("G1", "2026-11-01"), true);
  assert.equal(harness.attendance.isScheduledGroupDay("G1", "2026-11-02"), false);
  assert.equal(harness.attendance.isScheduledGroupDay("G2", "2026-11-02"), true);
  assert.equal(harness.attendance.isScheduledGroupDay("Groupe 2", "2026-11-03"), false);
});

test("JSON backup is created only after every required store is readable", () => {
  const harness = createHarness({
    initialValues: {
      "cap-savoir-students-v1": JSON.stringify([{ id: "s1" }]),
      "cap-savoir-attendance-v1": "[]"
    }
  });
  const downloads = [];
  harness.students.downloadFile = (content, filename, type) => downloads.push({ content, filename, type });
  harness.students.exportBackup();
  assert.equal(downloads.length, 1);
  const backup = JSON.parse(downloads[0].content);
  assert.deepEqual(Object.keys(backup).sort(), ["application", "attendance", "exportedAt", "operations", "students", "version"].sort());

  const failed = createHarness({
    initialValues: {
      "cap-savoir-students-v1": JSON.stringify([{ id: "s1" }]),
      "cap-savoir-attendance-v1": "invalid"
    }
  });
  const failedDownloads = [];
  failed.students.downloadFile = (...args) => failedDownloads.push(args);
  assert.throws(() => failed.students.exportBackup(), error => error.code === "STORAGE_INVALID_JSON");
  assert.equal(failedDownloads.length, 0);
});

test("restore interface confirms a verified full pre-restore backup and restores all stores", async () => {
  const currentStudent = {
    id: "before", name: "Avant", level: "CP1", parent: "P", phone: "0",
    group: "G1", startDate: "2026-01-01", archived: false
  };
  const replacementStudent = {
    id: "after", name: "Après", level: "CE1", parent: "P", phone: "1",
    group: "G2", startDate: "2026-02-01", archived: false
  };
  const harness = createHarness({
    initialValues: {
      "cap-savoir-students-v1": JSON.stringify([currentStudent]),
      "cap-savoir-attendance-v1": "[]"
    }
  });
  const message = { textContent: "", className: "" };
  harness.elements.set("student-message", message);
  const backup = {
    application: "CAP SAVOIR MANAGER", version: 4, exportedAt: "2026-11-09T00:00:00.000Z",
    students: [replacementStudent], attendance: [],
    operations: harness.operations.getAll()
  };
  const downloads = [];
  harness.students.downloadFile = (content, filename, type) => downloads.push({ content, filename, type });
  await harness.students.restoreBackup({ text: async () => JSON.stringify(backup) });
  assert.equal(downloads.length, 1);
  const prior = JSON.parse(downloads[0].content);
  assert.deepEqual(prior.students.map(item => item.id), ["before"]);
  assert.ok(Array.isArray(prior.attendance));
  assert.ok(Array.isArray(prior.operations.credits));
  assert.equal(JSON.parse(harness.values.get("cap-savoir-students-v1"))[0].id, "after");
  assert.deepEqual(JSON.parse(harness.values.get("cap-savoir-attendance-v1")), []);
  assert.ok(harness.values.has("cap-savoir-operations-v1"));
  assert.match(message.textContent, /Restauration complète vérifiée/);
});

test("student write failure preserves the previous raw value and reports no commit", async () => {
  const key = "cap-savoir-students-v1";
  const raw = JSON.stringify([{ id: "existing" }]);
  const harness = createHarness({ initialValues: { [key]: raw } });
  harness.denyWrites();
  await assert.rejects(harness.students.add({
    name: "Élève test", parent: "Responsable", phone: "00000000",
    level: "CP1", group: "G1", startDate: "2026-11-01"
  }), error => error.code === "STORAGE_WRITE");
  assert.equal(harness.values.get(key), raw);
});

test("attendance save stops before writing if either prerequisite read fails", async () => {
  const studentKey = "cap-savoir-students-v1";
  const attendanceKey = "cap-savoir-attendance-v1";
  const status = { dataset: { studentId: "s1" }, value: "present" };
  const message = { textContent: "" };
  const saveButton = { disabled: false };
  const harness = createHarness({
    initialValues: {
      [studentKey]: "{",
      [attendanceKey]: "[]"
    },
    statuses: [status]
  });
  harness.elements.set("attendance-date", { value: "2026-11-01" });
  harness.elements.set("attendance-group", { value: "G1" });
  harness.elements.set("attendance-message", message);
  harness.elements.set("save-attendance", saveButton);

  await harness.attendance.save();

  assert.equal(harness.writes.length, 0);
  assert.match(message.textContent, /JSON invalide/);
  assert.equal(saveButton.disabled, true);
});

test("attendance save stops before writing if attendance data is invalid", async () => {
  const studentKey = "cap-savoir-students-v1";
  const attendanceKey = "cap-savoir-attendance-v1";
  const message = { textContent: "" };
  const saveButton = { disabled: false };
  const harness = createHarness({
    initialValues: {
      [studentKey]: JSON.stringify([{
        id: "s1", name: "Élève", group: "G1", archived: false
      }]),
      [attendanceKey]: ""
    },
    statuses: [{ dataset: { studentId: "s1" }, value: "present" }]
  });
  harness.elements.set("attendance-date", { value: "2026-11-01" });
  harness.elements.set("attendance-group", { value: "G1" });
  harness.elements.set("attendance-message", message);
  harness.elements.set("save-attendance", saveButton);

  await harness.attendance.save();

  assert.equal(harness.writes.length, 0);
  assert.match(message.textContent, /vides et invalides/);
  assert.equal(saveButton.disabled, true);
});

test("attendance write failure never reports success", async () => {
  const studentKey = "cap-savoir-students-v1";
  const attendanceKey = "cap-savoir-attendance-v1";
  const message = { textContent: "" };
  const saveButton = { disabled: false };
  const harness = createHarness({
    initialValues: {
      [studentKey]: JSON.stringify([{
        id: "s1", name: "Élève", group: "G1", archived: false
      }]),
      [attendanceKey]: "[]"
    },
    statuses: [{ dataset: { studentId: "s1" }, value: "present" }]
  });
  harness.elements.set("attendance-date", { value: "2026-11-01" });
  harness.elements.set("attendance-group", { value: "G1" });
  harness.elements.set("attendance-message", message);
  harness.elements.set("save-attendance", saveButton);
  harness.denyWrites();

  await harness.attendance.save();

  assert.match(message.textContent, /écriture a échoué/i);
  assert.doesNotMatch(message.textContent, /enregistrées avec succès/i);
});
