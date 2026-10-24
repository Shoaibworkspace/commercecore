import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialFindings, reviewRepository } from '../scripts/check-repository.mjs';

test('upload guard rejects credential signatures without returning their values', () => {
  const secret = 'sb_' + 'secret_' + 'a'.repeat(30);
  assert.deepEqual(credentialFindings(secret), ['provider-secret']);
  assert.deepEqual(credentialFindings('sb_publishable_example'), []);
  const token = [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'),
    'syntheticSignature',
  ].join('.');
  assert.deepEqual(credentialFindings(token), ['service-role-token']);
  assert.equal(JSON.stringify(credentialFindings(secret)).includes(secret), false);
});

test('Git upload candidates exclude private bindings, runtime state and known credentials', () => {
  const report = reviewRepository();
  assert.deepEqual(report.findings, []);
  assert.ok(report.filesChecked > 100);
});
