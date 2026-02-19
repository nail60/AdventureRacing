import { parentPort, workerData } from 'worker_threads';
import { compressTracks } from '../compression/trackSimplifier.js';
import { computeTrackMetrics } from '../compression/trackMetrics.js';

const { tracks, maxBytes } = workerData;

const t0 = Date.now();
const compressed = compressTracks(tracks, maxBytes);
const t1 = Date.now();
const withMetrics = compressed.map(t => computeTrackMetrics(t));
const t2 = Date.now();

console.log(`[worker] compress=${t1 - t0}ms, metrics=${t2 - t1}ms, total=${t2 - t0}ms`);

parentPort!.postMessage(withMetrics);
