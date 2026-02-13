import JSZip from 'jszip';
import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import type { TrackData } from '@adventure-racing/shared';

export async function parseKMZ(buffer: Buffer, filename: string): Promise<TrackData[]> {
  const zip = await JSZip.loadAsync(buffer);

  const kmlFile = Object.keys(zip.files).find(name => name.endsWith('.kml'));
  if (!kmlFile) {
    throw new Error(`No KML file found in KMZ: ${filename}`);
  }

  const kmlContent = await zip.files[kmlFile].async('string');
  return parseKMLContent(kmlContent, filename);
}

export function parseKML(content: string, filename: string): TrackData[] {
  return parseKMLContent(content, filename);
}

function parseKMLContent(kmlContent: string, filename: string): TrackData[] {
  const doc = new DOMParser().parseFromString(kmlContent, 'text/xml');
  const geojson = kml(doc);

  const tracks: TrackData[] = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    const coords = geom.type === 'LineString'
      ? [geom.coordinates]
      : geom.type === 'MultiLineString'
        ? geom.coordinates
        : null;

    if (!coords) continue;

    for (const coordSet of coords) {
      const pilotName = (feature.properties?.name as string)
        || filename.replace(/\.(kmz|kml)$/i, '');

      const timesRaw = feature.properties?.coordinateProperties?.times as string[] | undefined;

      const positions: [number, number, number][] = [];
      const timestamps: number[] = [];

      for (let i = 0; i < coordSet.length; i++) {
        const [lon, lat, alt] = coordSet[i];
        positions.push([lat, lon, alt || 0]);

        if (timesRaw && timesRaw[i]) {
          timestamps.push(new Date(timesRaw[i]).getTime());
        } else {
          // Synthetic 1s timestamps if no time data
          timestamps.push(Date.now() + i * 1000);
        }
      }

      if (positions.length > 0) {
        tracks.push({ pilotName, timestamps, positions });
      }
    }
  }

  if (tracks.length === 0) {
    throw new Error(`No track data found in KML/KMZ: ${filename}`);
  }

  return tracks;
}
