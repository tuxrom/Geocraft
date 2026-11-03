import { BLOCKS } from './blocks';

// --------------------------------------------------------------- matériaux
export interface Material {
  id: string;
  label: string; // "en bois"
  name: string; // "Bois"
  tier: number; // niveau de récolte
  speed: number; // vitesse de minage
  dmg: number; // multiplicateur de dégâts
  main: string;
  light: string;
  dark: string;
  res: string | null; // ressource utilisée pour l'amélioration
}

export const MATERIALS: Material[] = [
  { id: 'bois', label: 'en bois', name: 'Bois', tier: 0, speed: 2, dmg: 1, main: '#9c7a4a', light: '#c9a46a', dark: '#5f4527', res: 'b_log' },
  { id: 'pierre', label: 'en pierre', name: 'Pierre', tier: 1, speed: 3.5, dmg: 1.25, main: '#8c8c8c', light: '#c0c0c0', dark: '#555555', res: 'b_stone' },
  { id: 'cuivre', label: 'en cuivre', name: 'Cuivre', tier: 1, speed: 4.2, dmg: 1.45, main: '#d1814f', light: '#f6b184', dark: '#8a4a26', res: 'res_cuivre' },
  { id: 'fer', label: 'en fer', name: 'Fer', tier: 2, speed: 5.5, dmg: 1.75, main: '#d6d6dc', light: '#ffffff', dark: '#8a8a94', res: 'res_fer' },
  { id: 'or', label: 'en or', name: 'Or', tier: 1, speed: 10, dmg: 1.5, main: '#f5d33f', light: '#fff4a0', dark: '#b08a10', res: 'res_or' },
  { id: 'diamant', label: 'en diamant', name: 'Diamant', tier: 3, speed: 8, dmg: 2.3, main: '#4be8e0', light: '#cffffc', dark: '#1a9a96', res: 'res_diamant' },
  { id: 'cristal', label: "en cristal d'Euclide", name: "Cristal d'Euclide", tier: 4, speed: 10, dmg: 3, main: '#a45df0', light: '#e6ccff', dark: '#5b2ca8', res: 'res_cristal' },
];
export const MAT: Record<string, Material> = {};
MATERIALS.forEach((m) => (MAT[m.id] = m));

// -------------------------------------------------------- types d'armes
export interface WeaponKind {
  id: string;
  label: string;
  math: string; // sens mathématique
  desc: string; // effet
  dmg: number;
  cd: number;
  reach: number;
  mine: { pick: number; axe: number; shovel: number };
  tier: number; // palier d'achat
  w: number; // coefficient de prix
  ranged?: boolean;
  shield?: boolean;
  param?: 'rayon' | 'angle';
}

const k = (
  id: string, label: string, math: string, desc: string, dmg: number, cd: number, reach: number,
  p: number, a: number, s: number, tier: number, w: number, extra: Partial<WeaponKind> = {},
): WeaponKind => ({ id, label, math, desc, dmg, cd, reach, mine: { pick: p, axe: a, shovel: s }, tier, w, ...extra });

export const KINDS: WeaponKind[] = [
  k('droite', 'Droite', 'Une droite est infinie dans les deux sens.', 'Épée longue : attaque de base, bonne portée.', 6, 0.5, 3.2, 0.4, 0.9, 0.3, 1, 1),
  k('segment', 'Segment', 'Un segment relie deux points.', 'Dague rapide : rafale de trois coups faibles.', 2.5, 0.55, 2.4, 0.2, 0.3, 0.7, 1, 1),
  k('demidroite', 'Demi-droite', 'Une demi-droite part d’un point et ne s’arrête jamais.', 'Lance : le coup traverse tout en ligne jusqu’au premier obstacle.', 7, 0.85, 14, 0.6, 0.4, 0.2, 2, 1.4),
  k('mediatrice', 'Médiatrice', 'La médiatrice coupe un segment en son milieu, à angle droit.', 'Tranche un ennemi en deux moitiés égales et blesse la zone des deux côtés.', 8, 0.9, 3.6, 0.5, 1.5, 0.3, 3, 1.8),
  k('mediane', 'Médiane', 'La médiane relie un sommet au milieu du côté opposé.', 'Projectile entre un sommet et le milieu du côté opposé d’un triangle de trois cibles.', 5, 1.1, 16, 0.5, 0.2, 0.2, 3, 1.8, { ranged: true }),
  k('bissectrice', 'Bissectrice', 'La bissectrice partage un angle en deux angles égaux.', 'Tir qui se sépare en deux projectiles d’angles égaux.', 4, 0.7, 20, 0.2, 0.2, 1, 2, 1.4, { ranged: true }),
  k('equerre', 'Équerre', 'Une équerre trace des angles droits.', 'Boomerang : tourne de 90° puis revient. Dévie les vecteurs.', 5, 1, 12, 0.6, 0.8, 0.6, 2, 1.4, { ranged: true }),
  k('compas', 'Compas', 'Le compas trace des cercles de rayon réglable.', 'Cercle de dégâts autour de vous. [R] règle le rayon.', 4, 1.4, 6, 1, 0.3, 0.3, 3, 1.8, { param: 'rayon' }),
  k('rapporteur', 'Rapporteur', 'Le rapporteur mesure les angles.', 'Arc : [R] règle l’angle de tir, la portée en dépend (maximale à 45°).', 6, 0.8, 30, 0.3, 0.2, 0.2, 3, 1.8, { ranged: true, param: 'angle' }),
  k('plus', 'Signe plus (+)', 'L’addition réunit.', 'Baguette : tir bonus qui fusionne deux fractions proches, clic droit pour se soigner.', 2, 0.5, 18, 0.1, 0.1, 0.1, 3, 2, { ranged: true }),
  k('multiplication', 'Signe multiplication (×)', 'Multiplier, c’est répéter.', 'Coup en croix sur les diagonales : double dégâts contre les fractions, mais renforce les survivantes.', 5, 0.8, 3.2, 1, 0.6, 0.2, 3, 1.9),
  k('division', 'Signe division (÷)', 'Diviser, c’est partager.', 'Coupe un ennemi en fractions plus petites.', 3, 0.7, 3.2, 0.2, 0.2, 1, 3, 1.8),
  k('moins', 'Signe moins (−)', 'Soustraire, c’est retirer.', 'Retire les bonus d’une cible, la ralentit et inverse les fractions négatives.', 2, 0.5, 3.2, 0.2, 0.2, 0.8, 2, 1.2),
  k('egal', 'Signe égal (=)', 'Deux membres de part et d’autre : l’équilibre.', 'Bouclier (clic droit) : encaisse la moitié des dégâts et renvoie l’autre moitié.', 3, 0.6, 2.6, 0.3, 0.3, 0.3, 3, 1.8, { shield: true }),
  k('racine', 'Racine carrée (√)', 'La racine carrée remonte du carré au nombre.', 'Pioche : extrait aussi le bloc situé derrière, en profondeur.', 5, 0.7, 3.2, 2, 0.5, 1, 2, 1.5),
  k('pi', 'Pi (π)', 'π a une infinité de décimales.', 'Lames circulaires en rotation autour de vous pendant cinq secondes.', 3.14, 6, 3, 0.8, 0.8, 0.2, 4, 2.5),
  k('paralleles', 'Parallèles', 'Deux droites parallèles ne se rejoignent jamais.', 'Deux lames synchronisées frappent côte à côte.', 4, 0.6, 3.8, 1.2, 0.4, 0.2, 3, 1.9),
  k('perpendiculaire', 'Perpendiculaire (⊥)', 'Deux droites perpendiculaires font un angle droit.', 'Repousse à angle droit de votre visée.', 4, 0.7, 3.4, 0.8, 0.3, 0.3, 3, 1.8),
  k('triangle', 'Triangle', 'Le triangle est la forme la plus rigide.', 'Arme de jet : le triangle perce et traverse les ennemis.', 6, 0.7, 22, 0.7, 0.3, 0.7, 2, 1.4, { ranged: true }),
  k('carre', 'Carré', 'Quatre côtés égaux, quatre angles droits.', 'Bouclier (clic droit) qui encaisse 75 % des dégâts, et coup de bélier.', 4, 0.8, 2.6, 0.5, 0.3, 0.5, 2, 1.3, { shield: true }),
  k('rectangle', 'Rectangle', 'Plus long que large.', 'Allonge la portée : frappe de loin.', 5, 0.85, 5.6, 0.4, 0.7, 0.3, 2, 1.4),
  k('ovale', 'Ovale', 'L’ellipse roule sans fin.', 'Arme de jet qui roule sur le sol et rebondit.', 3, 0.9, 20, 0.2, 0.2, 0.6, 3, 1.7, { ranged: true }),
  k('losange', 'Losange', 'Quatre côtés égaux, deux angles aigus.', 'Quatre éclats en losange.', 3, 0.8, 18, 0.4, 0.2, 0.2, 3, 1.7, { ranged: true }),
  k('trapeze', 'Trapèze', 'Deux côtés parallèles.', 'Large balayage en arc devant vous.', 4, 0.65, 3.4, 0.2, 1.1, 0.4, 2, 1.4),
  k('hexagone', 'Hexagone', 'Six côtés, six sommets.', 'Six projectiles en couronne autour de vous.', 3, 1.1, 18, 0.2, 0.2, 0.2, 4, 2.4, { ranged: true }),
  k('sinus', 'Sinus (sin x)', 'La fonction sinus oscille entre -1 et 1.', 'Projectile qui ondule en sinusoïde.', 4, 0.6, 22, 0.2, 0.2, 0.2, 3, 1.9, { ranged: true }),
  k('integrale', 'Intégrale (∫)', 'L’intégrale additionne une infinité de petites parts.', 'Marque une cible : les dégâts s’accumulent pendant quatre secondes.', 12, 1.2, 14, 0.2, 0.2, 0.2, 4, 2.4, { ranged: true }),
];
export const KIND: Record<string, WeaponKind> = {};
KINDS.forEach((x) => (KIND[x.id] = x));

// ------------------------------------------------------------------ objets
export type ItemType = 'block' | 'res' | 'weapon' | 'food';

export interface ItemDef {
  id: string;
  label: string;
  type: ItemType;
  stack: number;
  block?: number;
  kind?: string;
  mat?: string;
  heal?: number;
  desc?: string;
}

export const ITEMS: Record<string, ItemDef> = {};
export const ITEM_ORDER: string[] = [];

function reg(it: ItemDef) {
  ITEMS[it.id] = it;
  ITEM_ORDER.push(it.id);
}

for (const b of BLOCKS) {
  if (b.noItem || b.baseId !== b.id) continue;
  reg({ id: 'b_' + b.name, label: b.label, type: 'block', stack: 64, block: b.id });
}
reg({ id: 'res_cuivre', label: 'Lingot de cuivre', type: 'res', stack: 64 });
reg({ id: 'res_fer', label: 'Lingot de fer', type: 'res', stack: 64 });
reg({ id: 'res_or', label: "Lingot d'or", type: 'res', stack: 64 });
reg({ id: 'res_diamant', label: 'Diamant', type: 'res', stack: 64 });
reg({ id: 'res_cristal', label: "Cristal d'Euclide", type: 'res', stack: 64 });
reg({ id: 'food_pomme', label: 'Pomme de Newton', type: 'food', stack: 16, heal: 6, desc: 'Rend 3 cœurs. Elle tombe toujours du bon côté.' });
for (const kd of KINDS) for (const m of MATERIALS) {
  reg({ id: `w_${kd.id}_${m.id}`, label: `${kd.label} ${m.label}`, type: 'weapon', stack: 1, kind: kd.id, mat: m.id });
}

export const itemOf = (id: string): ItemDef => ITEMS[id] ?? ITEMS['b_dirt'];

/** Ressources comptées dans l'indicateur : objet -> nom affiché. */
export const RESOURCES: { id: string; label: string }[] = [
  { id: 'b_dirt', label: 'Terre' },
  { id: 'b_stone', label: 'Pierre' },
  { id: 'b_log', label: 'Bois' },
  { id: 'res_cuivre', label: 'Cuivre' },
  { id: 'res_fer', label: 'Fer' },
  { id: 'res_or', label: 'Or' },
  { id: 'res_diamant', label: 'Diamant' },
  { id: 'res_cristal', label: "Cristal d'Euclide" },
];

export const weaponId = (kind: string, mat: string) => `w_${kind}_${mat}`;

export interface Stack { id: string; n: number }

// ----------------------------------------------------------- fabrication
export interface Recipe {
  out: string;
  n: number;
  cost: [string, number][];
  group: 'Bois' | 'Pierre' | 'Formes' | 'Cuisson' | 'Divers';
}
export const RECIPES: Recipe[] = [
  { out: 'b_planks', n: 4, cost: [['b_log', 1]], group: 'Bois' },
  { out: 'b_door', n: 1, cost: [['b_planks', 6]], group: 'Bois' },
  { out: 'b_ladder', n: 3, cost: [['b_planks', 5]], group: 'Bois' },
  { out: 'b_stairs_wood', n: 4, cost: [['b_planks', 6]], group: 'Bois' },
  { out: 'b_roof', n: 4, cost: [['b_planks', 6]], group: 'Bois' },
  { out: 'b_glass', n: 1, cost: [['b_sand', 1], ['b_planks', 1]], group: 'Cuisson' },
  { out: 'b_stone_bricks', n: 4, cost: [['b_stone', 4]], group: 'Pierre' },
  { out: 'b_stairs_stone', n: 4, cost: [['b_stone_bricks', 6]], group: 'Pierre' },
  { out: 'b_crenel', n: 4, cost: [['b_stone_bricks', 4]], group: 'Pierre' },
  { out: 'b_prism', n: 2, cost: [['b_stone_bricks', 3]], group: 'Formes' },
  { out: 'b_pyramid', n: 1, cost: [['b_stone_bricks', 4]], group: 'Formes' },
  { out: 'b_dome', n: 2, cost: [['b_stone_bricks', 3], ['b_glass', 1]], group: 'Formes' },
  { out: 'b_altar', n: 1, cost: [['b_stone_bricks', 4], ['res_diamant', 1]], group: 'Divers' },
];

// ---------------------------------------------------------------- boutique
export interface Offer {
  kind: 'buy' | 'upgrade' | 'misc';
  item: string; // objet obtenu
  n?: number;
  from?: string; // objet remplacé (amélioration)
  cost: [string, number][];
  label: string;
}

const BUY_COST: Record<number, [string, number][]> = {
  1: [['b_log', 6], ['b_dirt', 6]],
  2: [['b_stone', 10], ['res_cuivre', 4]],
  3: [['res_fer', 6], ['b_stone', 10], ['res_or', 2]],
  4: [['res_diamant', 3], ['res_or', 4], ['res_cristal', 1]],
};

export function buyOffer(kind: string): Offer {
  const kd = KIND[kind];
  const cost = BUY_COST[kd.tier].map(([r, n]) => [r, Math.max(1, Math.round(n * kd.w))] as [string, number]);
  return { kind: 'buy', item: weaponId(kind, 'bois'), cost, label: `${kd.label} en bois` };
}

export function upgradeOffer(kind: string, fromMat: string): Offer | null {
  const idx = MATERIALS.findIndex((m) => m.id === fromMat);
  if (idx < 0 || idx >= MATERIALS.length - 1) return null;
  const to = MATERIALS[idx + 1];
  const kd = KIND[kind];
  const base = [10, 7, 6, 5, 4, 3, 2][idx + 1] ?? 3;
  const n = Math.max(2, Math.round(base * kd.w));
  const cost: [string, number][] = [[to.res!, n]];
  if (to.id === 'cristal') cost.push(['res_diamant', Math.max(1, Math.round(kd.w))]);
  if (to.id === 'diamant') cost.push(['res_or', Math.max(1, Math.round(kd.w * 1.5))]);
  return { kind: 'upgrade', item: weaponId(kind, to.id), from: weaponId(kind, fromMat), cost, label: `${kd.label} : ${MATERIALS[idx].name} vers ${to.name}` };
}

export const MISC_OFFERS: Offer[] = [
  { kind: 'misc', item: 'food_pomme', cost: [['b_dirt', 4]], label: 'Pomme de Newton' },
  { kind: 'misc', item: 'b_planks', n: 8, cost: [['b_dirt', 8]], label: 'Planches x8' },
];
