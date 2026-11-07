import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const read = (file) => readFileSync(new URL(file, dist));

test('install manifest has valid home-screen icons and standalone launch', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((icon) => icon.sizes === `${size}x${size}` && icon.purpose === 'any');
    assert.ok(icon);
    const png = read(icon.src.slice(1));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('worker precaches the shell, excludes API navigations, and keeps API reads network-only', () => {
  const routes = [];
  let precache = [];
  const workbox = {
    precacheAndRoute(entries) { precache = entries },
    cleanupOutdatedCaches() {},
    createHandlerBoundToURL(url) { return url },
    NavigationRoute: class { constructor(handler, options) { this.handler = handler; this.options = options } },
    NetworkOnly: class {},
    registerRoute(...args) { routes.push(args) },
  };
  const define = (_dependencies, factory) => factory(workbox);
  runInNewContext(read('sw.js').toString(), { self: { define, addEventListener() {} }, define });
  assert.ok(precache.some((entry) => entry.url === 'index.html'));
  assert.ok(!precache.some((entry) => /^\/?api(?:\/|$)/.test(entry.url)));
  const navigation = routes.find(([route]) => route instanceof workbox.NavigationRoute)[0];
  for (const path of ['/api', '/api/customers', '/api/payments']) assert.ok(navigation.options.denylist.some((pattern) => pattern.test(path)));
  const [matches, strategy] = routes.find(([match]) => typeof match === 'function');
  assert.equal(matches({ url: new URL('https://example.com/api/customers') }), true);
  assert.equal(matches({ url: new URL('https://example.com/history') }), false);
  assert.ok(strategy instanceof workbox.NetworkOnly);
});
