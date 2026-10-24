import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../worker/app.ts';

test('health returns honest phase status, request ID, and secure JSON headers', async () => {
  const response = await app.request('/api/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.phase, 8);
  assert.equal(body.data.paymentMode, 'demo');
  assert.equal(response.headers.get('x-request-id'), body.requestId);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('unknown API returns JSON 404 instead of the frontend HTML', async () => {
  const response = await app.request('/api/not-implemented');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'NOT_FOUND');
});

test('unavailable database returns 503 without leaking internal SQL or secrets', async () => {
  const response = await app.request(
    '/api/ready',
    {},
    {
      DB: {
        prepare() {
          throw new Error('secret database internals');
        },
      },
    },
  );
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(JSON.parse(body).error.code, 'NOT_READY');
  assert.doesNotMatch(body, /secret database internals/);
});
