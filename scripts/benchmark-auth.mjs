import { Miniflare } from 'miniflare';
import { writeFileSync, readFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  hashPassword,
  verifyPassword,
  PASSWORD_ITERATIONS,
} from '../backend/src/services/crypto.ts';

const nodeMeasurements = [];
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  const hash = await hashPassword('local-benchmark-only-passphrase');
  nodeMeasurements.push(Number((performance.now() - start).toFixed(2)));
  if (!(await verifyPassword('local-benchmark-only-passphrase', hash)))
    throw new Error('Password verification failed');
}
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const mf = new Miniflare({
  modules: true,
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: ['nodejs_compat'],
  script: `
import {pbkdf2} from 'node:crypto';
export default {async fetch(){
  const key=await new Promise((resolve,reject)=>pbkdf2('benchmark-only-passphrase','benchmark-only-salt',${PASSWORD_ITERATIONS},32,'sha256',(err,key)=>err?reject(err):resolve(key)));
  return Response.json({bytes:key.length,iterations:${PASSWORD_ITERATIONS}});
}};`,
});
const workerMeasurements = [];
try {
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    const response = await mf.dispatchFetch('http://benchmark.test/');
    const result = await response.json();
    if (result.bytes !== 32) throw new Error(`Worker hashing failed: ${JSON.stringify(result)}`);
    workerMeasurements.push(Number((performance.now() - start).toFixed(2)));
  }
} finally {
  await mf.dispose();
}
const report = {
  recordedAt: new Date().toISOString(),
  node: process.version,
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0]?.model,
  algorithm: 'PBKDF2-HMAC-SHA256',
  iterations: PASSWORD_ITERATIONS,
  saltBytes: 32,
  keyBytes: 32,
  nodeHashWallMs: nodeMeasurements,
  localWorkerRoundTripWallMs: workerMeasurements,
  limitation:
    'Local wall-clock measurements only. Not Cloudflare Free CPU evidence. Production authentication stays gated pending a live Free-plan verification.',
};
writeFileSync(
  new URL('../docs/reports/auth-benchmark.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
