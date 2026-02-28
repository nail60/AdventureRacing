import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRTM_DIR = path.resolve(__dirname, '../../data/srtm');

// SRTM1 = 3601×3601 (1 arc-second), SRTM3 = 1201×1201 (3 arc-second)
const SRTM1_SAMPLES = 3601;
const SRTM3_SAMPLES = 1201;
const SRTM1_BYTES = SRTM1_SAMPLES * SRTM1_SAMPLES * 2;
const SRTM3_BYTES = SRTM3_SAMPLES * SRTM3_SAMPLES * 2;
const VOID = -32768;

interface Tile {
  buf: Buffer;
  samples: number;
}

// NASA/USGS SRTM v3 download base
const SRTM_BASE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/skadi';

// In-memory cache of tile buffers
const tileCache = new Map<string, Tile | null>();

/** Return tile name like "N47W122" for a given lat/lon. */
function tileName(lat: number, lon: number): string {
  const latInt = Math.floor(lat);
  const lonInt = Math.floor(lon);
  const ns = latInt >= 0 ? 'N' : 'S';
  const ew = lonInt >= 0 ? 'E' : 'W';
  const latStr = String(Math.abs(latInt)).padStart(2, '0');
  const lonStr = String(Math.abs(lonInt)).padStart(3, '0');
  return `${ns}${latStr}${ew}${lonStr}`;
}

function bufToTile(buf: Buffer): Tile | null {
  if (buf.length === SRTM1_BYTES) return { buf, samples: SRTM1_SAMPLES };
  if (buf.length === SRTM3_BYTES) return { buf, samples: SRTM3_SAMPLES };
  return null;
}

/** Download a tile from S3. Returns the .hgt buffer or null on failure. */
function downloadTile(name: string): Promise<Tile | null> {
  const latDir = name.slice(0, 3); // e.g. "N47"
  const url = `${SRTM_BASE_URL}/${latDir}/${name}.hgt.gz`;
  const gzPath = path.join(SRTM_DIR, `${name}.hgt.gz`);
  const hgtPath = path.join(SRTM_DIR, `${name}.hgt`);

  return new Promise((resolve) => {
    console.log(`Downloading SRTM tile: ${name} from ${url}`);
    const file = fs.createWriteStream(gzPath);

    const request = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(gzPath); } catch {}
        console.warn(`SRTM tile ${name} not available (HTTP ${res.statusCode})`);
        resolve(null);
        return;
      }
      res.pipe(file);
      file.on('finish', async () => {
        file.close();
        try {
          const { createGunzip } = await import('zlib');
          const { pipeline } = await import('stream/promises');
          const input = fs.createReadStream(gzPath);
          const gunzip = createGunzip();
          const output = fs.createWriteStream(hgtPath);
          await pipeline(input, gunzip, output);
          try { fs.unlinkSync(gzPath); } catch {}
          const buf = fs.readFileSync(hgtPath);
          const tile = bufToTile(buf);
          if (tile) {
            resolve(tile);
          } else {
            console.warn(`SRTM tile ${name} has unexpected size: ${buf.length}`);
            resolve(null);
          }
        } catch (err: any) {
          console.warn(`Failed to decompress SRTM tile ${name}: ${err.message}`);
          try { fs.unlinkSync(gzPath); } catch {}
          resolve(null);
        }
      });
    });

    request.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(gzPath); } catch {}
      console.warn(`Failed to download SRTM tile ${name}: ${err.message}`);
      resolve(null);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      file.close();
      try { fs.unlinkSync(gzPath); } catch {}
      console.warn(`SRTM tile ${name} download timed out`);
      resolve(null);
    });
  });
}

/** Load a tile (from disk cache, memory cache, or download). */
async function loadTile(name: string): Promise<Tile | null> {
  if (tileCache.has(name)) return tileCache.get(name)!;

  fs.mkdirSync(SRTM_DIR, { recursive: true });

  const hgtPath = path.join(SRTM_DIR, `${name}.hgt`);
  if (fs.existsSync(hgtPath)) {
    const buf = fs.readFileSync(hgtPath);
    const tile = bufToTile(buf);
    if (tile) {
      tileCache.set(name, tile);
      return tile;
    }
  }

  const tile = await downloadTile(name);
  tileCache.set(name, tile);
  return tile;
}

/** Read a single sample from the tile buffer. */
function readSample(tile: Tile, row: number, col: number): number | null {
  const s = tile.samples;
  const r = Math.max(0, Math.min(s - 1, row));
  const c = Math.max(0, Math.min(s - 1, col));
  const offset = (r * s + c) * 2;
  const val = tile.buf.readInt16BE(offset);
  return val === VOID ? null : val;
}

/** Bilinear interpolation of terrain height for a single point. */
function interpolateHeight(tile: Tile, latFrac: number, lonFrac: number): number | null {
  const s = tile.samples;
  // SRTM row 0 is the northern edge of the tile
  const row = (1 - latFrac) * (s - 1);
  const col = lonFrac * (s - 1);

  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const r1 = Math.min(r0 + 1, s - 1);
  const c1 = Math.min(c0 + 1, s - 1);

  const h00 = readSample(tile, r0, c0);
  const h01 = readSample(tile, r0, c1);
  const h10 = readSample(tile, r1, c0);
  const h11 = readSample(tile, r1, c1);

  // If any corner is void, return the first non-null or null
  if (h00 === null || h01 === null || h10 === null || h11 === null) {
    return h00 ?? h01 ?? h10 ?? h11;
  }

  const dr = row - r0;
  const dc = col - c0;
  return h00 * (1 - dr) * (1 - dc) +
         h01 * (1 - dr) * dc +
         h10 * dr * (1 - dc) +
         h11 * dr * dc;
}

/**
 * Look up terrain heights for an array of [lat, lon, alt] positions.
 * Returns AGL (above ground level) per point, or null where terrain data unavailable.
 */
export async function computeAGL(
  positions: [number, number, number][]
): Promise<(number | null)[]> {
  if (positions.length === 0) return [];

  // Collect unique tile names needed
  const neededTiles = new Set<string>();
  for (const [lat, lon] of positions) {
    neededTiles.add(tileName(lat, lon));
  }

  // Load all needed tiles
  const tiles = new Map<string, Tile | null>();
  for (const name of neededTiles) {
    tiles.set(name, await loadTile(name));
  }

  // Compute AGL for each point
  const agl: (number | null)[] = [];
  for (const [lat, lon, alt] of positions) {
    const name = tileName(lat, lon);
    const tile = tiles.get(name);
    if (!tile) {
      agl.push(null);
      continue;
    }

    const latFrac = lat - Math.floor(lat);
    const lonFrac = lon - Math.floor(lon);
    const terrainHeight = interpolateHeight(tile, latFrac, lonFrac);
    if (terrainHeight === null) {
      agl.push(null);
    } else {
      agl.push(alt - terrainHeight);
    }
  }

  return agl;
}
