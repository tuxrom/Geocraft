/// <reference lib="webworker" />
import { Terrain } from './gen';
import { meshChunk } from './mesher';

let terrain: Terrain | null = null;
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'init') {
    terrain = new Terrain(m.seed);
  } else if (m.type === 'gen') {
    const blocks = terrain!.generate(m.cx, m.cz, m.mods);
    ctx.postMessage({ type: 'gen', job: m.job, cx: m.cx, cz: m.cz, blocks }, [blocks.buffer]);
  } else if (m.type === 'mesh') {
    const r = meshChunk(m.cx, m.cz, m.self, m.w, m.e, m.n, m.s);
    const tr: ArrayBuffer[] = [];
    for (const part of [r.opaque, r.water]) {
      tr.push(part.pos.buffer as ArrayBuffer, part.uv.buffer as ArrayBuffer, part.tile.buffer as ArrayBuffer, part.light.buffer as ArrayBuffer, part.index.buffer as ArrayBuffer);
    }
    ctx.postMessage({ type: 'mesh', job: m.job, cx: m.cx, cz: m.cz, version: m.version, result: r }, tr);
  }
};
