import { ITEMS, KIND, MAT } from '../data/items';
import { BLOCKS } from '../data/blocks';

export function describeItem(id: string): string {
  const it = ITEMS[id];
  if (!it) return '';
  let s = `<b>${it.label}</b>`;
  if (it.type === 'weapon') {
    const kd = KIND[it.kind!], m = MAT[it.mat!];
    s += `\n${kd.math}\n<i>${kd.desc}</i>`;
    s += `\nDégâts : ${(kd.dmg * m.dmg).toFixed(1)}   Cadence : ${(1 / kd.cd).toFixed(1)}/s`;
    s += `\nMatériau : ${m.name} (niveau ${m.tier})`;
    const mi = kd.mine;
    const bits: string[] = [];
    if (mi.pick >= 0.5) bits.push('pioche');
    if (mi.axe >= 0.5) bits.push('hache');
    if (mi.shovel >= 0.5) bits.push('pelle');
    if (bits.length) s += `\nSert de : ${bits.join(', ')}`;
  } else if (it.type === 'block') {
    const b = BLOCKS[it.block!];
    s += `\nBloc · solidité ${b.hardness}`;
  } else if (it.type === 'food') s += `\n<i>${it.desc ?? ''}</i>`;
  else s += '\nRessource. À échanger chez le Professeur Théorème.';
  return s;
}
