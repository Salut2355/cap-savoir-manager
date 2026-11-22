"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const recoverySource = fs.readFileSync(path.join(__dirname, "..", "js", "storage-recovery.js"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "operations.js"), "utf8");

class FakeElement {
  constructor(value = "") {
    this.value = value;
    this.options = [];
    this.children = [];
    this.listeners = {};
    this.elements = {};
    this.className = "";
    this.textContent = "";
    this.checked = false;
    this.dataset = {};
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  replaceChildren(...children) { this.children = children; this.options = children.filter(item => item instanceof FakeOption); }
  appendChild(child) { this.children.push(child); }
  append(...children) { this.children.push(...children); }
  add(option) { this.options.push(option); }
  querySelectorAll() { return []; }
  reportValidity() { return true; }
  reset() {}
}

class FakeOption {
  constructor(text, value) { this.text = text; this.textContent = text; this.value = value; }
}

function makeApp(options = {}) {
  const students = options.students || [{
    id: "s1", name: "Élève test", level: "CP1", parent: "Parent", phone: "00000000",
    group: "G1", startDate: "2026-11-01", archived: false,
    registrationExempted: false, billingHistoryVerified: true,
    levelHistory: [{ level: "CP1", effectiveFrom: "2026-11-01" }]
  }];
  const data = new Map([["cap-savoir-students-v1", JSON.stringify(students)]]);
  data.set("cap-savoir-attendance-v1", "[]");
  const writes = [];
  let denyReads = false;
  let denyWrites = false;
  const failWriteKeys = new Map();
  const failAfterWrites = new Map();
  const ids = new Map();
  const selectors = new Map();
  const section = new FakeElement();
  const forms = new Map();
  const createForm = id => {
    const form = new FakeElement();
    form.elements = {
      studentId: new FakeElement(""), chargeId: new FakeElement(""), amount: new FakeElement("2500"),
      date: new FakeElement("2026-11-09"), method: new FakeElement("Espèces"),
      reference: new FakeElement(""), receipt: new FakeElement(""), receiptVerified: new FakeElement(false),
      paymentId: new FakeElement(""), reason: new FakeElement("test"), label: new FakeElement("test"),
      creditId: new FakeElement(""),
      category: new FakeElement("test"), source: new FakeElement("test"), name: new FakeElement("test"),
      phone: new FakeElement(""), level: new FakeElement("CP1"), group: new FakeElement("G1"), status: new FakeElement("À contacter")
    };
    form.querySelectorAll = () => [];
    forms.set(id, form);
    return form;
  };
  for (const id of ["payment-form", "refund-form", "credit-application-form", "expense-form", "inflow-form", "prospect-form"]) createForm(id);
  const prepareButton = new FakeElement();
  const studentSelect = forms.get("payment-form").elements.studentId;
  const chargeSelect = forms.get("payment-form").elements.chargeId;
  const refundSelect = forms.get("refund-form").elements.paymentId;
  section.querySelector = selector => selector.startsWith("#") && selector.endsWith("-form")
    ? forms.get(selector.slice(1))
    : selector === "#prepare-charges" ? prepareButton
      : selector === '#payment-form [name="studentId"]' ? studentSelect
        : selector === '#credit-application-form [name="creditId"]' ? forms.get("credit-application-form").elements.creditId : null;
  section.querySelectorAll = () => [];
  selectors.set('#payment-form [name="studentId"]', studentSelect);
  selectors.set('#payment-form [name="chargeId"]', chargeSelect);
  selectors.set('#refund-form [name="paymentId"]', refundSelect);
  selectors.set('#credit-application-form [name="creditId"]', forms.get("credit-application-form").elements.creditId);
  selectors.set('#credit-application-form [name="chargeId"]', forms.get("credit-application-form").elements.chargeId);
  for (const id of ["operations-message", "operations-summary", "operations-history", "prospects-list", "billing-reconciliation"]) ids.set(id, new FakeElement());
  ids.set("operations-section", section);

  const localStorage = {
    getItem(key) { if (denyReads) throw new Error("read blocked"); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) {
      writes.push({ key, value });
      if (denyWrites) throw new Error("write blocked");
      const remainingFailures = failWriteKeys.get(key) || 0;
      if (remainingFailures > 0) { failWriteKeys.set(key, remainingFailures - 1); throw new Error("one-shot write failure"); }
      if (failAfterWrites.has(key)) {
        const successesLeft = failAfterWrites.get(key);
        if (successesLeft === 0) { failAfterWrites.delete(key); throw new Error("delayed write failure"); }
        failAfterWrites.set(key, successesLeft - 1);
      }
      data.set(key, String(value));
    },
    removeItem(key) { data.delete(key); }
  };
  const document = {
    addEventListener() {},
    getElementById(id) { return ids.get(id) || null; },
    querySelector(selector) { return selectors.get(selector) || null; },
    createElement() { return new FakeElement(); },
    createTextNode(text) { return { textContent: text }; }
  };
  const TestDate = options.today ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [`${options.today}T12:00:00Z`])); }
    static now() { return new Date(`${options.today}T12:00:00Z`).getTime(); }
  } : Date;
  const context = vm.createContext({
    localStorage, document, navigator: { locks: { request: async (_name, callback) => callback() } },
    StudentManager: {
      storageKey: "cap-savoir-students-v1",
      getAll: () => JSON.parse(data.get("cap-savoir-students-v1"))
    },
    AttendanceManager: {
      storageKey: "cap-savoir-attendance-v1",
      getAll: () => JSON.parse(data.get("cap-savoir-attendance-v1"))
    },
    crypto: {
      randomUUID: () => `id-${writes.length}`,
      subtle: { digest: async (_algorithm, bytes) => Uint8Array.from(createHash("sha256").update(Buffer.from(bytes)).digest()).buffer }
    },
    TextEncoder,
    console: { error() {} }, confirm: () => true, Option: FakeOption,
    FormData: class { constructor(form) { this.rows = Object.entries(form.elements).filter(([key, value]) => !(key === "receiptVerified" && !value.checked)).map(([key, value]) => [key, value.value]); } [Symbol.iterator]() { return this.rows[Symbol.iterator](); } },
    Date: TestDate, Intl, Map, Set, Array, JSON, Error, TypeError, Object, String, Number, Math
  });
  vm.runInContext(recoverySource, context, { filename: "storage-recovery.js" });
  vm.runInContext(source, context, { filename: "operations.js" });
  vm.runInContext("globalThis.__manager = OperationsManager", context);
  vm.runInContext("globalThis.__recovery = DataRestoreRecovery", context);
  return {
    manager: context.__manager, recovery: context.__recovery, data, writes, forms, prepareButton, studentSelect, chargeSelect, ids,
    denyReads(value = true) { denyReads = value; },
    denyWrites(value = true) { denyWrites = value; },
    failWriteOnce(key) { failWriteKeys.set(key, (failWriteKeys.get(key) || 0) + 1); },
    failWriteAfter(key, successfulWrites) { failAfterWrites.set(key, successfulWrites); }
  };
}

test("finance flow snapshots the configured tariff and records a partial payment", async () => {
  const app = makeApp();
  app.manager.init();
  await app.prepareButton.listeners.click();
  let ledger = app.manager.getAll();
  assert.equal(ledger.charges.find(charge => charge.kind === "tuition").amount, 5000);
  assert.equal(ledger.charges.find(charge => charge.kind === "registration").amount, 2000);

  app.studentSelect.value = "s1";
  app.studentSelect.listeners.change();
  const tuition = app.chargeSelect.options.find(option => option.value.includes(":tuition:"));
  assert.ok(tuition);
  app.chargeSelect.value = tuition.value;
  const form = app.forms.get("payment-form");
  const submit = form.listeners.submit;
  await submit({ preventDefault() {}, currentTarget: form });
  ledger = app.manager.getAll();
  assert.equal(ledger.payments.length, 1);
  assert.equal(ledger.payments[0].amount, 2500);
  assert.equal(ledger.payments[0].chargeId, tuition.value);
  assert.match(app.ids.get("operations-message").textContent, /enregistrée et vérifiée/);
});

test("a repeated cash payment candidate is blocked without an extra write", async () => {
  const app = makeApp();
  app.manager.init();
  await app.prepareButton.listeners.click();
  app.studentSelect.value = "s1";
  app.studentSelect.listeners.change();
  app.chargeSelect.value = app.chargeSelect.options.find(option => option.value.includes(":tuition:")).value;
  const form = app.forms.get("payment-form");
  await form.listeners.submit({ preventDefault() {}, currentTarget: form });
  const writesAfterFirst = app.writes.length;
  await form.listeners.submit({ preventDefault() {}, currentTarget: form });
  assert.equal(app.writes.length, writesAfterFirst);
  assert.equal(app.manager.getAll().payments.length, 1);
  assert.match(app.ids.get("operations-message").textContent, /identique existe déjà/);
});

test("a storage read error prevents charge writes", async () => {
  const app = makeApp();
  app.manager.init();
  app.denyReads();
  await app.prepareButton.listeners.click();
  assert.equal(app.writes.length, 0);
  assert.match(app.ids.get("operations-message").textContent, /inaccessible/);
});

test("expense, other inflow, and prospect forms append separate traceable records", async () => {
  const app = makeApp();
  app.manager.init();
  for (const [formId, expectedKey] of [
    ["expense-form", "expenses"],
    ["inflow-form", "inflows"],
    ["prospect-form", "prospects"]
  ]) {
    const form = app.forms.get(formId);
    await form.listeners.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(app.manager.getAll()[expectedKey].length, 1);
    assert.match(app.ids.get("operations-message").textContent, /enregistrée et vérifiée/);
  }
  assert.equal(app.manager.getAll().expenses[0].amount, 2500);
  assert.equal(app.manager.getAll().inflows[0].amount, 2500);
  assert.equal(app.manager.getAll().prospects[0].name, "test");
});

test("monthly cycles retain the original 29, 30, and 31 day anchor", async () => {
  const students = [31, 30, 29].map(day => {
    const startDate = `2028-01-${day}`;
    return {
      id: `s${day}`, name: `Student ${day}`, level: "CP1", group: "G1",
      startDate, archived: false, registrationExempted: true,
      billingHistoryVerified: true, levelHistory: [{ level: "CP1", effectiveFrom: startDate }]
    };
  });
  const app = makeApp({ students, today: "2028-04-10" });
  app.manager.init();
  await app.prepareButton.listeners.click();
  const charges = app.manager.getAll().charges;
  for (const [day, expected] of [
    [31, ["2028-01-31", "2028-02-29", "2028-03-31"]],
    [30, ["2028-01-30", "2028-02-29", "2028-03-30"]],
    [29, ["2028-01-29", "2028-02-29", "2028-03-29"]]
  ]) {
    assert.deepEqual(charges.filter(item => item.studentId === `s${day}`).map(item => item.periodStart), expected);
  }
});

test("overpayment creates a traceable credit that can be applied and refunded", async () => {
  const app = makeApp();
  app.manager.init();
  await app.prepareButton.listeners.click();
  app.studentSelect.value = "s1";
  app.studentSelect.listeners.change();
  const tuition = app.chargeSelect.options.find(option => option.value.includes(":tuition:"));
  app.chargeSelect.value = tuition.value;
  const paymentForm = app.forms.get("payment-form");
  paymentForm.elements.amount.value = "6000";
  await paymentForm.listeners.submit({ preventDefault() {}, currentTarget: paymentForm });

  let ledger = app.manager.getAll();
  assert.equal(ledger.payments[0].appliedAmount, 5000);
  assert.equal(ledger.payments[0].creditAmount, 1000);
  assert.equal(ledger.credits[0].amount, 1000);

  const creditForm = app.forms.get("credit-application-form");
  creditForm.elements.creditId.value = ledger.credits[0].id;
  creditForm.elements.creditId.listeners.change();
  creditForm.elements.chargeId.value = ledger.charges.find(charge => charge.kind === "registration").id;
  creditForm.elements.amount.value = "700";
  await creditForm.listeners.submit({ preventDefault() {}, currentTarget: creditForm });
  ledger = app.manager.getAll();
  assert.equal(ledger.creditApplications.length, 1);
  assert.equal(ledger.creditApplications[0].amount, 700);

  const refundForm = app.forms.get("refund-form");
  refundForm.elements.paymentId.value = ledger.payments[0].id;
  refundForm.elements.amount.value = "300";
  refundForm.elements.method.value = "Wave";
  const writesBeforeInvalidRefund = app.writes.length;
  await refundForm.listeners.submit({ preventDefault() {}, currentTarget: refundForm });
  assert.equal(app.writes.length, writesBeforeInvalidRefund);
  assert.match(app.ids.get("operations-message").textContent, /référence opérateur est obligatoire/);
  refundForm.elements.reference.value = "WAVE-REF-001";
  await refundForm.listeners.submit({ preventDefault() {}, currentTarget: refundForm });
  ledger = app.manager.getAll();
  assert.equal(ledger.refunds.length, 1);
  assert.equal(ledger.refunds[0].creditAmount, 300);
  assert.equal(ledger.refunds[0].chargeAmount, 0);
  assert.equal(ledger.refunds[0].method, "Wave");
  assert.equal(ledger.refunds[0].reference, "WAVE-REF-001");
  assert.equal(ledger.payments[0].amount, 6000);
  assert.equal(ledger.credits[0].amount, 1000);

  const beforeRestore = app.manager.captureRestoreSnapshot();
  const backup = fullBundle(app);
  backup.operations = ledger;
  await app.manager.restoreAll(backup, beforeRestore.raw);
  assert.equal(app.manager.getAll().creditApplications.length, 1);
  assert.equal(app.manager.getAll().refunds.length, 1);
});

test("legacy reconciliation creates only an explicit opening balance and future baseline", async () => {
  const legacy = {
    id: "legacy1", name: "Ancien élève", level: "CM2", group: "G1",
    startDate: "2024-01-31", archived: false, registrationExempted: false
  };
  const app = makeApp({ students: [legacy] });
  app.manager.init();
  const reconciliation = app.ids.get("billing-reconciliation");
  assert.equal(reconciliation.children.length, 1);
  const row = reconciliation.children[0];
  const registrationSelect = row.children[1].children[0];
  const amountInput = row.children[2].children[0];
  const evidenceInput = row.children[3].children[0];
  const verified = row.children[4].children[0];
  const button = row.children[5];
  registrationSelect.value = "paid";
  amountInput.value = "3000";
  evidenceInput.value = "Cahier vérifié, page 12";
  verified.checked = true;
  await button.listeners.click();

  let ledger = app.manager.getAll();
  assert.equal(ledger.billingBaselines.length, 1);
  assert.equal(ledger.billingBaselines[0].openingBalance, 3000);
  assert.ok(ledger.billingBaselines[0].firstBillPeriod >= "2026-11-09");
  assert.equal(ledger.charges.length, 1);
  assert.equal(ledger.charges[0].kind, "opening_balance");
  assert.equal(ledger.charges[0].amount, 3000);
  await app.prepareButton.listeners.click();
  ledger = app.manager.getAll();
  assert.equal(ledger.charges.filter(charge => charge.kind === "tuition").length, 0);
  const beforeRestore = app.manager.captureRestoreSnapshot();
  const backup = fullBundle(app);
  backup.operations = ledger;
  await app.manager.restoreAll(backup, beforeRestore.raw);
  assert.equal(app.manager.getAll().billingBaselines.length, 1);
});

test("a storage write error does not report a successful operation", async () => {
  const app = makeApp();
  app.manager.init();
  app.denyWrites();
  await app.prepareButton.listeners.click();
  assert.equal(app.writes.length, 1);
  assert.equal(app.data.has("cap-savoir-operations-v1"), false);
  assert.doesNotMatch(app.ids.get("operations-message").textContent, /écriture vérifiée/i);
  assert.match(app.ids.get("operations-message").textContent, /Échéances non préparées/);
});

function fullBundle(app) {
  return {
    application: "CAP SAVOIR MANAGER",
    version: 4,
    exportedAt: "2028-04-10T00:00:00.000Z",
    students: JSON.parse(app.data.get("cap-savoir-students-v1")),
    attendance: [{ id: "session-restored", date: "2028-04-02", group: "G1", entries: [] }],
    operations: app.manager.getAll()
  };
}

test("complete restore replaces all three stores and verifies the result", async () => {
  const app = makeApp();
  const before = app.manager.captureRestoreSnapshot();
  const backup = fullBundle(app);
  backup.students = [{ id: "restored", name: "Restored", level: "CP1", parent: "P", phone: "0", group: "G1", startDate: "2028-04-01", archived: false }];
  await app.manager.restoreAll(backup, before.raw);
  assert.equal(JSON.parse(app.data.get("cap-savoir-students-v1"))[0].id, "restored");
  assert.equal(JSON.parse(app.data.get("cap-savoir-attendance-v1"))[0].id, "session-restored");
  assert.deepEqual(Object.keys(JSON.parse(app.data.get("cap-savoir-operations-v1"))).sort(), Object.keys(app.manager.getAll()).sort());
});

test("incomplete restore is rejected before any localStorage write", async () => {
  const app = makeApp();
  const before = app.manager.captureRestoreSnapshot();
  const backup = fullBundle(app);
  delete backup.attendance;
  await assert.rejects(app.manager.restoreAll(backup, before.raw), /Sauvegarde incomplète/);
  assert.equal(app.writes.length, 0);
});

test("restore rejects attendance entries that reference missing students", async () => {
  const app = makeApp();
  const backup = fullBundle(app);
  backup.attendance[0].entries = [{ studentId: "missing-student", status: "present" }];
  assert.throws(() => app.manager.validateBackup(backup), /présence.*invalide/i);
  assert.equal(app.writes.length, 0);
});

test("backup validation rejects incomplete or mismatched payment and refund allocations", () => {
  const app = makeApp();
  const makeBackup = () => {
    const backup = fullBundle(app);
    backup.operations = {
      charges: [{ id: "c1", studentId: "s1", amount: 10000, dueDate: "2026-11-09" }],
      payments: [{ id: "p1", studentId: "s1", chargeId: "c1", amount: 6000, date: "2026-11-09", method: "Espèces", appliedAmount: 5000, creditAmount: 1000 }],
      refunds: [], credits: [{ id: "cr1", paymentId: "p1", studentId: "s1", amount: 1000 }],
      creditApplications: [], expenses: [], inflows: [], prospects: [], billingBaselines: []
    };
    return backup;
  };

  const missingPaymentShare = makeBackup();
  delete missingPaymentShare.operations.payments[0].appliedAmount;
  assert.throws(() => app.manager.validateBackup(missingPaymentShare), /ventilation.*incomplète/i);

  const mismatchedPaymentTotal = makeBackup();
  mismatchedPaymentTotal.operations.payments[0].appliedAmount = 4900;
  assert.throws(() => app.manager.validateBackup(mismatchedPaymentTotal), /correspondre exactement au montant reçu/i);

  const missingRefundShare = makeBackup();
  missingRefundShare.operations.refunds = [{ id: "r1", paymentId: "p1", creditId: "cr1", chargeId: "c1", studentId: "s1", amount: 200, creditAmount: 200, date: "2026-11-09" }];
  assert.throws(() => app.manager.validateBackup(missingRefundShare), /ventilation.*incomplète/i);

  const mismatchedRefundTotal = makeBackup();
  mismatchedRefundTotal.operations.refunds = [{ id: "r1", paymentId: "p1", creditId: "cr1", chargeId: "c1", studentId: "s1", amount: 200, chargeAmount: 100, creditAmount: 150, date: "2026-11-09" }];
  assert.throws(() => app.manager.validateBackup(mismatchedRefundTotal), /correspond pas exactement au montant remboursé/i);
});

test("due reminders use the same balance as payment forms, including credit settlements", () => {
  const app = makeApp({ today: "2026-11-09" });
  app.manager.init();
  const ledger = {
    charges: [{ id: "c1", studentId: "s1", amount: 5000, dueDate: "2026-11-09" }],
    payments: [], refunds: [], credits: [],
    creditApplications: [{ id: "a1", creditId: "cr1", studentId: "s1", chargeId: "c1", amount: 5000, appliedAt: "2026-11-09T10:00:00.000Z" }],
    expenses: [], inflows: [], prospects: [], billingBaselines: []
  };
  app.data.set("cap-savoir-operations-v1", JSON.stringify(ledger));
  assert.equal(app.manager.getReminders().length, 0, "a charge fully covered by credit is not due");
  app.studentSelect.value = "s1";
  app.studentSelect.listeners.change();
  assert.equal(app.chargeSelect.options.some(option => option.value === "c1"), false, "a settled charge is not offered for payment");

  ledger.creditApplications[0].amount = 2000;
  app.data.set("cap-savoir-operations-v1", JSON.stringify(ledger));
  const reminders = app.manager.getReminders();
  assert.equal(reminders.length, 1, "a partially credited charge still has a reminder");
  app.manager.refresh();
  app.studentSelect.listeners.change();
  const option = app.chargeSelect.options.find(item => item.value === "c1");
  assert.ok(option);
  const balance = option.text.match(/([\d\u00a0\u202f ]+) FCFA restant/);
  assert.ok(balance);
  assert.equal(Number(balance[1].replace(/\D/g, "")), 3000);
});

test("restore failure rolls back and verifies the original values", async () => {
  const app = makeApp();
  const before = app.manager.captureRestoreSnapshot();
  const backup = fullBundle(app);
  app.failWriteOnce("cap-savoir-attendance-v1");
  await assert.rejects(
    app.manager.restoreAll(backup, before.raw),
    error => error.code === "RESTORE_ROLLED_BACK"
  );
  assert.equal(app.data.get("cap-savoir-students-v1"), before.raw.students);
  assert.equal(app.data.get("cap-savoir-attendance-v1"), before.raw.attendance);
  assert.equal(app.data.get("cap-savoir-operations-v1") ?? null, before.raw.operations);
});

test("unverified rollback is surfaced as an uncertain partial restore", async () => {
  const app = makeApp();
  const before = app.manager.captureRestoreSnapshot();
  const backup = fullBundle(app);
  backup.students[0].name = "Restored name";
  app.failWriteOnce("cap-savoir-attendance-v1");
  app.failWriteAfter("cap-savoir-students-v1", 1);
  await assert.rejects(
    app.manager.restoreAll(backup, before.raw),
    error => error.code === "RESTORE_PARTIAL"
  );
  assert.notEqual(app.data.get("cap-savoir-students-v1"), before.raw.students);
  assert.equal(app.data.get("cap-savoir-attendance-v1"), before.raw.attendance);
});

test("restore refuses a snapshot that changed after prior backup preparation", async () => {
  const app = makeApp();
  const before = app.manager.captureRestoreSnapshot();
  const backup = fullBundle(app);
  app.data.set("cap-savoir-students-v1", JSON.stringify([{ id: "later-change" }]));
  await assert.rejects(app.manager.restoreAll(backup, before.raw), error => error.code === "RESTORE_STALE");
  assert.equal(app.writes.length, 0);
});

test("restore refuses to write when a current store is corrupt or inaccessible", async () => {
  const corruptApp = makeApp();
  const corruptSnapshot = corruptApp.manager.captureRestoreSnapshot();
  const corruptBackup = fullBundle(corruptApp);
  corruptApp.data.set("cap-savoir-students-v1", "not-json");
  await assert.rejects(corruptApp.manager.restoreAll(corruptBackup, corruptSnapshot.raw));
  assert.equal(corruptApp.writes.length, 0);

  const inaccessibleApp = makeApp();
  const inaccessibleSnapshot = inaccessibleApp.manager.captureRestoreSnapshot();
  const inaccessibleBackup = fullBundle(inaccessibleApp);
  inaccessibleApp.denyReads();
  await assert.rejects(inaccessibleApp.manager.restoreAll(inaccessibleBackup, inaccessibleSnapshot.raw));
  assert.equal(inaccessibleApp.writes.length, 0);
});
