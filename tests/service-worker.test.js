"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const origin = "http://localhost:8080";

function createWorker({ fetchImpl = async () => new Response("online"), failCacheMatch = false } = {}) {
  const listeners = new Map();
  const cached = new Map();
  const self = {
    location: new URL(origin),
    addEventListener(type, callback) { listeners.set(type, callback); },
    skipWaiting() {},
    clients: { claim() {} }
  };
  const cache = {
    async addAll(files) {
      for (const file of files) {
        const relative = file === "./" ? "index.html" : file.replace(/^\.\//, "");
        const absolute = path.join(root, relative);
        if (!fs.existsSync(absolute)) throw new TypeError(`missing precache resource: ${file}`);
        cached.set(new URL(file, `${origin}/`).href, new Response(fs.readFileSync(absolute)));
      }
    },
    async put(request, response) { cached.set(new URL(request.url || request, `${origin}/`).href, response); }
  };
  const caches = {
    async open() { return cache; },
    async match(request) {
      if (failCacheMatch) throw new TypeError("simulated cache lookup failure");
      return cached.get(new URL(request.url || request, `${origin}/`).href) || null;
    },
    async keys() { return []; },
    async delete() { return true; }
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: fetchImpl,
    URL,
    Response,
    console: { error() {}, warn() {} }
  });
  vm.runInContext(source, context, { filename: "service-worker.js" });
  return { listeners, cached };
}

async function dispatchFetch(worker, request) {
  let responsePromise = null;
  worker.listeners.get("fetch")({
    request,
    respondWith(promise) { responsePromise = Promise.resolve(promise); }
  });
  return responsePromise;
}

test("service worker precaches the local favicon and recovery module", async () => {
  const worker = createWorker();
  let installPromise;
  worker.listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.ok(worker.cached.has(`${origin}/favicon.ico`));
  assert.ok(worker.cached.has(`${origin}/favicon.svg`));
  assert.ok(worker.cached.has(`${origin}/js/storage-recovery.js`));
});

test("an uncached static resource while offline resolves to an explicit 503, not a rejected promise", async () => {
  const worker = createWorker({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  const promise = dispatchFetch(worker, new Request(`${origin}/missing.css`));
  assert.ok(promise, "static same-origin request should be handled");
  const response = await promise;
  assert.equal(response.status, 503);
  assert.match(await response.text(), /indisponible hors connexion/i);
});

test("a cached favicon is served without a network request", async () => {
  let networkCalls = 0;
  const worker = createWorker({ fetchImpl: async () => { networkCalls++; throw new TypeError("Failed to fetch"); } });
  let installPromise;
  worker.listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;

  const response = await dispatchFetch(worker, new Request(`${origin}/favicon.ico`));
  assert.equal(response.status, 200);
  assert.equal(networkCalls, 0);
});

test("network and cache failures for a missing static asset resolve without an unhandled rejection", async () => {
  const worker = createWorker({
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
    failCacheMatch: true
  });
  const promise = dispatchFetch(worker, new Request(`${origin}/missing.css`));
  const response = await promise;
  assert.equal(response.status, 503);
  assert.match(await response.text(), /indisponible hors connexion/i);
});

test("cached static assets and app navigation remain available offline", async () => {
  const worker = createWorker({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  let installPromise;
  worker.listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;

  const iconResponse = await dispatchFetch(worker, new Request(`${origin}/favicon.ico`));
  assert.equal(iconResponse.status, 200);

  const navigation = { url: `${origin}/index.html`, method: "GET", mode: "navigate" };
  const pageResponse = await dispatchFetch(worker, navigation);
  assert.equal(pageResponse.status, 200);
});

test("non-static same-origin requests are not intercepted or disguised as offline assets", async () => {
  const worker = createWorker({ fetchImpl: async () => { throw new TypeError("Failed to fetch API"); } });
  const promise = dispatchFetch(worker, new Request(`${origin}/api/health`));
  assert.equal(await promise, null);
});

test("an online HTTP error response is returned unchanged and not cached", async () => {
  const worker = createWorker({ fetchImpl: async () => new Response("server error", { status: 500 }) });
  const response = await dispatchFetch(worker, new Request(`${origin}/js/app.js`));
  assert.equal(response.status, 500);
  assert.equal(worker.cached.has(`${origin}/js/app.js`), false);
});

test("an online missing favicon stays a 404 and is never changed into a fake 200", async () => {
  const worker = createWorker({ fetchImpl: async () => new Response("not found", { status: 404 }) });
  const response = await dispatchFetch(worker, new Request(`${origin}/favicon.ico`));
  assert.equal(response.status, 404);
  assert.equal(worker.cached.has(`${origin}/favicon.ico`), false);
});
