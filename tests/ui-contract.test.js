"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const students = fs.readFileSync(path.join(root, "js", "students.js"), "utf8");
const operations = fs.readFileSync(path.join(root, "js", "operations.js"), "utf8");

test("mobile-first shell has safe-area support and a persistent five-view mobile nav", () => {
  assert.match(html, /viewport-fit=cover/);
  const mobileNav = html.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.ok(mobileNav);
  assert.equal((mobileNav.match(/<button\b/g) || []).length, 5);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.mobile-nav\s*\{\s*position:\s*fixed/s);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /font-size:\s*16px/);
});

test("student search, filters, archive selection, and profile histories are present", () => {
  for (const id of ["student-search", "student-filter-level", "student-filter-group", "student-filter-status"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(students, /student\.levelHistory/);
  assert.match(students, /Historique des paiements/);
  assert.match(students, /Historique des présences/);
});

test("finance UI provides filtered expense and operation records plus a print receipt action", () => {
  for (const id of ["operations-search", "operations-kind-filter", "expense-search", "expense-list", "prospect-search"]) {
    assert.match(operations, new RegExp(`id="${id}"`));
  }
  assert.match(operations, /function printReceipt\(payment\)/);
  assert.match(operations, /dépenses enregistrées comme payées|DÉCAISSEMENTS SAISIS/i);
});

test("the group overview is derived from existing student records without storing new state", () => {
  assert.match(app, /renderGroups\(\)\s*\{/);
  assert.match(app, /StudentManager\.getAll\(\)/);
  assert.match(app, /Mercredi, samedi et dimanche/);
  assert.match(app, /Lundi, mercredi et vendredi/);
  assert.match(app, /G3/);
  assert.match(operations, /value="G3"/);
});
