/** Catalogue des blocs. Module pur (utilisable dans le worker). */

export type Box = [number, number, number, number, number, number]; // x0,y0,z0,x1,y1,z1
export type RenderKind = 'cube' | 'boxes' | 'pyramid' | 'prism' | 'dome';
export type ToolClass = 'pick' | 'axe' | 'shovel' | 'hand';

export interface BlockDef {
  id: number;
  name: string;
  label: string;
  /** Tuiles par face : +x, -x, +y, -y, +z, -z */
  tiles: [string, string, string, string, string, string];
  solid: boolean;
  opaque: boolean;
  cutout: boolean;
  liquid: boolean;
  render: RenderKind;
  boxes: Box[];
  hardness: number;
  tool: ToolClass;
  /** Niveau de matériau minimal pour récolter (-1 : à la main). */
  tier: number;
  drop: string | null;
  climb: boolean;
  /** Identifiant du bloc de base (pour l'objet correspondant). */
  baseId: number;
  variants?: number[];
  /** Rotation 0..3 (nord, ouest, sud, est). */
  rot: number;
  /** Bloc obtenu en interagissant (porte ouverte/fermée). */
  toggleId?: number;
  placeTall?: boolean;
  placeByFace?: boolean;
  /** Pas dans l'inventaire créatif / hors objets. */
  noItem?: boolean;
  special?: 'altar';
}

export const BLOCKS: BlockDef[] = [];
export const B: Record<string, number> = {};
const FULL: Box = [0, 0, 0, 1, 1, 1];

const rotBox = (b: Box, k: number): Box => {
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let i = 0; i < k; i++) {
    const nx0 = z0, nx1 = z1, nz0 = 1 - x1, nz1 = 1 - x0;
    x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1;
  }
  return [x0, y0, z0, x1, y1, z1];
};

type Opts = Partial<Omit<BlockDef, 'id' | 'name' | 'label' | 'tiles'>>;

function def(name: string, label: string, tiles: string | string[], o: Opts = {}): number {
  const id = BLOCKS.length;
  let t: string[];
  if (typeof tiles === 'string') t = [tiles, tiles, tiles, tiles, tiles, tiles];
  else if (tiles.length === 3) t = [tiles[2], tiles[2], tiles[0], tiles[1], tiles[2], tiles[2]];
  else t = tiles;
  const render = o.render ?? 'cube';
  const d: BlockDef = {
    id, name, label,
    tiles: t as BlockDef['tiles'],
    solid: o.solid ?? true,
    opaque: o.opaque ?? (render === 'cube' && !(o.cutout ?? false) && !(o.liquid ?? false)),
    cutout: o.cutout ?? false,
    liquid: o.liquid ?? false,
    render,
    boxes: o.boxes ?? (render === 'cube' && (o.solid ?? true) ? [FULL] : []),
    hardness: o.hardness ?? 1,
    tool: o.tool ?? 'hand',
    tier: o.tier ?? -1,
    drop: o.drop === undefined ? 'b_' + name : o.drop,
    climb: o.climb ?? false,
    baseId: o.baseId ?? id,
    rot: o.rot ?? 0,
    ...(o.toggleId !== undefined ? { toggleId: o.toggleId } : {}),
    ...(o.placeTall ? { placeTall: true } : {}),
    ...(o.placeByFace ? { placeByFace: true } : {}),
    ...(o.noItem ? { noItem: true } : {}),
    ...(o.special ? { special: o.special } : {}),
  };
  BLOCKS.push(d);
  B[name] = id;
  return id;
}

// --- Blocs de base ---------------------------------------------------------
def('air', 'Air', 'stone', { solid: false, opaque: false, render: 'boxes', boxes: [], drop: null, noItem: true });
def('grass', 'Herbe', ['grass_top', 'dirt', 'grass_side'], { hardness: 0.6, tool: 'shovel', drop: 'b_dirt' });
def('dirt', 'Terre', 'dirt', { hardness: 0.5, tool: 'shovel' });
def('stone', 'Pierre', 'stone', { hardness: 1.5, tool: 'pick', tier: 0 });
def('sand', 'Sable', 'sand', { hardness: 0.5, tool: 'shovel' });
def('gravel', 'Gravier', 'gravel', { hardness: 0.6, tool: 'shovel' });
def('water', 'Eau', 'water', { solid: false, opaque: false, liquid: true, hardness: 100, drop: null, noItem: true });
def('log', 'Bois de tronc', ['log_top', 'log_top', 'log_side'], { hardness: 2, tool: 'axe' });
def('leaves', 'Feuilles', 'leaves', { hardness: 0.2, tool: 'axe', cutout: true, opaque: false, drop: null });
def('planks', 'Planches', 'planks', { hardness: 2, tool: 'axe' });
def('bedrock', 'Socle indestructible', 'bedrock', { hardness: 99999, tool: 'pick', tier: 99, drop: null, noItem: true });
def('copper_ore', 'Minerai de cuivre', 'copper_ore', { hardness: 3, tool: 'pick', tier: 1, drop: 'res_cuivre' });
def('iron_ore', 'Minerai de fer', 'iron_ore', { hardness: 3, tool: 'pick', tier: 1, drop: 'res_fer' });
def('gold_ore', "Minerai d'or", 'gold_ore', { hardness: 3, tool: 'pick', tier: 2, drop: 'res_or' });
def('diamond_ore', 'Minerai de diamant', 'diamond_ore', { hardness: 3.5, tool: 'pick', tier: 2, drop: 'res_diamant' });
def('euclid_ore', "Cristal d'Euclide", 'euclid_ore', { hardness: 5, tool: 'pick', tier: 3, drop: 'res_cristal' });
def('stone_bricks', 'Pierre taillée', 'stone_bricks', { hardness: 2, tool: 'pick', tier: 0 });
def('glass', 'Verre', 'glass', { hardness: 0.3, cutout: true, opaque: false, drop: 'b_glass' });
def('snow', 'Neige', 'snow', { hardness: 0.3, tool: 'shovel' });
def('altar', "Autel de l'équation", ['altar_top', 'stone_bricks', 'altar_side'], { hardness: 4, tool: 'pick', tier: 1, special: 'altar' });

// --- Blocs à formes ----------------------------------------------------------
function rotated(name: string, label: string, tiles: string | string[], boxes: Box[], o: Opts = {}, kinds = 4): number {
  const ids: number[] = [];
  for (let k = 0; k < kinds; k++) {
    const id = def(k === 0 ? name : `${name}_r${k}`, label, tiles, {
      render: 'boxes', opaque: false, ...o,
      boxes: boxes.map((b) => rotBox(b, k)),
      rot: k, noItem: k > 0 || o.noItem,
      baseId: ids.length ? ids[0] : undefined,
      ...(k > 0 ? { drop: 'b_' + name } : {}),
    });
    ids.push(id);
  }
  for (const id of ids) BLOCKS[id].variants = ids;
  return ids[0];
}

const stairBoxes: Box[] = [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.5]];
rotated('stairs_wood', 'Escalier en bois', 'planks', stairBoxes, { hardness: 2, tool: 'axe' });
rotated('stairs_stone', 'Escalier en pierre', 'stone_bricks', stairBoxes, { hardness: 2, tool: 'pick', tier: 0 });
rotated('roof', 'Toit', 'roof', stairBoxes, { hardness: 1.5, tool: 'axe' });
rotated('crenel', 'Créneau', 'stone_bricks', [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 0.36, 1, 1], [0.64, 0.5, 0, 1, 1, 1]], { hardness: 2, tool: 'pick', tier: 0 });
rotated('ladder', 'Échelle', 'ladder', [[0, 0, 0, 1, 1, 0.1]], { solid: false, cutout: true, climb: true, hardness: 0.4, tool: 'axe', placeByFace: true });

// Portes : 4 fermées puis 4 ouvertes.
{
  const closed: number[] = [], open: number[] = [];
  for (let k = 0; k < 4; k++) {
    closed.push(def(k === 0 ? 'door' : `door_r${k}`, 'Porte', 'door', {
      render: 'boxes', opaque: false, cutout: true, boxes: [rotBox([0, 0, 0, 1, 1, 0.19], k)],
      hardness: 2, tool: 'axe', rot: k, noItem: k > 0, placeTall: true,
      ...(k > 0 ? { drop: 'b_door' } : {}),
    }));
  }
  for (let k = 0; k < 4; k++) {
    open.push(def(`door_open${k}`, 'Porte ouverte', 'door', {
      render: 'boxes', opaque: false, cutout: true, boxes: [rotBox([0, 0, 0, 1, 1, 0.19], (k + 1) % 4)],
      hardness: 2, tool: 'axe', rot: k, noItem: true, drop: 'b_door',
    }));
  }
  for (let k = 0; k < 4; k++) {
    BLOCKS[closed[k]].baseId = closed[0]; BLOCKS[open[k]].baseId = closed[0];
    BLOCKS[closed[k]].variants = closed;
    BLOCKS[closed[k]].toggleId = open[k];
    BLOCKS[open[k]].toggleId = closed[k];
  }
}

// Formes géométriques : prisme, pyramide, demi-sphère.
rotated('prism', 'Prisme', 'prism', [[0, 0, 0, 1, 0.34, 1], [0.17, 0.34, 0, 0.83, 0.67, 1], [0.33, 0.67, 0, 0.67, 1, 1]], { render: 'prism', hardness: 1.5, tool: 'pick', tier: 0 });
def('pyramid', 'Pyramide', 'pyramid', {
  render: 'pyramid', opaque: false, hardness: 1.5, tool: 'pick', tier: 0,
  boxes: [[0, 0, 0, 1, 0.25, 1], [0.125, 0.25, 0.125, 0.875, 0.5, 0.875], [0.25, 0.5, 0.25, 0.75, 0.75, 0.75], [0.375, 0.75, 0.375, 0.625, 1, 0.625]],
});
def('dome', 'Demi-sphère', 'dome', {
  render: 'dome', opaque: false, hardness: 1.5, tool: 'pick', tier: 0,
  boxes: [[0.05, 0, 0.05, 0.95, 0.22, 0.95], [0.2, 0.22, 0.2, 0.8, 0.5, 0.8]],
});

// --- Tables de recherche rapide ---------------------------------------------
export const NB = 256;
export const OPAQUE = new Uint8Array(NB);
export const SOLID = new Uint8Array(NB);
export const LIQUID = new Uint8Array(NB);
export const FULLCUBE = new Uint8Array(NB);
for (const d of BLOCKS) {
  OPAQUE[d.id] = d.opaque ? 1 : 0;
  SOLID[d.id] = d.solid ? 1 : 0;
  LIQUID[d.id] = d.liquid ? 1 : 0;
  FULLCUBE[d.id] = d.render === 'cube' && d.solid ? 1 : 0;
}

export const blockOf = (id: number): BlockDef => BLOCKS[id] ?? BLOCKS[0];

/** Liste de toutes les tuiles utilisées, dans l'ordre de l'atlas. */
export const TILE_NAMES: string[] = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'gravel', 'water', 'log_top', 'log_side', 'leaves',
  'planks', 'bedrock', 'copper_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'euclid_ore', 'stone_bricks',
  'glass', 'snow', 'altar_top', 'altar_side', 'roof', 'ladder', 'door', 'prism', 'pyramid', 'dome',
];
export const TILE_INDEX: Record<string, number> = {};
TILE_NAMES.forEach((n, i) => (TILE_INDEX[n] = i));
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

/** Tableau des indices de tuiles par bloc et par face. */
export const FACE_TILE = new Uint8Array(NB * 6);
for (const d of BLOCKS) for (let f = 0; f < 6; f++) FACE_TILE[d.id * 6 + f] = TILE_INDEX[d.tiles[f]] ?? 0;
