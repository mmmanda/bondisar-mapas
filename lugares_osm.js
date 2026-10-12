// Lugares con nombre (parques, escuelas, hospitales, plazas…) sacados del mapa sin internet de una provincia
// (capa «pois» de las teselas de zoom máximo) → <id>-lugares.json para el buscador de la app.
// Uso: node lugares_osm.js salida/tucuman.pmtiles -66.3,-28.05,-64.45,-26.0 salida/tucuman-lugares.json
const fs = require('fs');
const zlib = require('zlib');
const { PMTiles } = require('pmtiles');
const { VectorTile } = require('@mapbox/vector-tile');
const Pbf = require('pbf');

const [ent, caja, sal] = process.argv.slice(2);
const [x0, y0, x1, y1] = caja.split(',').map(Number);
const fd = fs.openSync(ent, 'r');
const fuente = {
  getKey: () => ent,
  getBytes: async (desde, largo) => {
    const b = Buffer.alloc(largo);
    const n = fs.readSync(fd, b, 0, largo, desde);
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + n) };
  },
};
const gunzip = async (buf, comp) => { if (comp !== 2) return buf; const b = zlib.gunzipSync(Buffer.from(buf)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const tx = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const ty = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };

(async () => {
  const p = new PMTiles(fuente, undefined, gunzip);
  const z = (await p.getHeader()).maxZoom;
  const vistos = new Set(), out = [];
  for (let x = tx(x0, z); x <= tx(x1, z); x++) {
    for (let y = ty(y1, z); y <= ty(y0, z); y++) {
      const t = await p.getZxy(z, x, y);
      if (!t) continue;
      const capa = new VectorTile(new Pbf(new Uint8Array(t.data))).layers.pois;
      if (!capa) continue;
      for (let i = 0; i < capa.length; i++) {
        const f = capa.feature(i), pr = f.properties, nom = pr['name:es'] || pr.name;
        if (!nom || f.type !== 1) continue;
        const pt = f.toGeoJSON(x, y, z).geometry.coordinates;
        const c = Array.isArray(pt[0]) ? pt[0] : pt;
        const k = nom.toLowerCase() + '|' + c[0].toFixed(3) + '|' + c[1].toFixed(3);
        if (vistos.has(k)) continue;
        vistos.add(k);
        out.push({ n: nom, k: pr.kind || '', c: [+c[0].toFixed(5), +c[1].toFixed(5)] });
      }
    }
  }
  out.sort((a, b) => a.n.localeCompare(b.n, 'es'));
  fs.writeFileSync(sal, JSON.stringify(out));
  console.log(sal + ': ' + out.length + ' lugares');
})();
