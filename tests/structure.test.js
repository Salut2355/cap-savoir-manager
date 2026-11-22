"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("main app container and app panels are present and closed", () => {
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.equal((html.match(/<\/main>/g) || []).length, 1);
  assert.match(html, /<main\s+id="app"[^>]*>[\s\S]*<\/main>/);
  for (const panel of ["dashboard", "students", "attendance", "operations"]) {
    assert.match(html, new RegExp(`data-app-panel="${panel}"`));
  }
});

test("every referenced local script exists and the order respects dependencies", () => {
  const scripts = [...html.matchAll(/<script\s+src="\.\/([^\"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scripts, ["js/storage-recovery.js", "js/students.js", "js/attendance.js", "js/operations.js", "js/app.js"]);
  scripts.forEach(file => assert.equal(fs.existsSync(path.join(root, file)), true, `${file} missing`));
});

test("local favicon variants exist and are referenced by the document", () => {
  assert.match(html, /<link rel="icon" href="\.\/favicon\.ico"/);
  assert.match(html, /<link rel="icon" href="\.\/favicon\.svg" type="image\/svg\+xml"/);
  const ico = fs.readFileSync(path.join(root, "favicon.ico"));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico[6], 32);
  assert.equal(ico[7], 32);
  assert.equal(ico.readUInt32LE(18), 22);
  assert.match(fs.readFileSync(path.join(root, "favicon.svg"), "utf8"), /<svg\b/);
  assert.match(fs.readFileSync(path.join(root, "tools", "serve-local.js"), "utf8"), /"favicon\.ico", "favicon\.svg"/);
});

test("attendance and operations section hosts exist for module initialization", () => {
  assert.match(html, /id="attendance-section"[^>]*data-app-panel="attendance"/);
  assert.match(html, /id="operations-section"[^>]*data-app-panel="operations"/);
  assert.match(fs.readFileSync(path.join(root, "js", "attendance.js"), "utf8"), /attendance-session-status/);
  assert.match(fs.readFileSync(path.join(root, "js", "operations.js"), "utf8"), /prepare-charges/);
});

test("all primary navigation views have matching panels and mobile navigation", () => {
  const views = ["dashboard", "students", "groups", "attendance", "operations"];
  for (const view of views) {
    assert.match(html, new RegExp(`data-view="${view}"`));
    assert.match(html, new RegExp(`data-app-panel="${view}"`));
  }
  assert.match(html, /class="mobile-nav"/);
  assert.match(html, /id="dashboard-reminders"/);
  assert.match(html, /id="dashboard-recent"/);
  assert.match(html, /id="groups-overview"/);
});
