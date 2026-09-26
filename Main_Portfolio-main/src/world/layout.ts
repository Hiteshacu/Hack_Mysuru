// World layout: where every portfolio "station" sits and how paths connect them.

export type ZoneId =
  | 'welcome'
  | 'about'
  | 'skills'
  | 'projects'
  | 'achievements'
  | 'certifications'
  | 'contact';

export interface ZoneDef {
  id: ZoneId;
  title: string;
  subtitle: string;
  x: number;
  z: number;
  /** Flattened plateau radius. */
  flat: number;
  /** Distance at which the zone counts as "discovered". */
  discover: number;
  /** Where travel drops the player, relative to the zone center. */
  arrive: [number, number];
  color: string;
}

export const WORLD_SIZE = 260;
export const PLAY_RADIUS = 120;
export const WATER_LEVEL = 0;

export const zones: ZoneDef[] = [
  { id: 'welcome', title: 'The Gate', subtitle: 'Welcome', x: 0, z: 44, flat: 11, discover: 12, arrive: [0, 12], color: '#f2b35c' },
  { id: 'about', title: 'The Cabin', subtitle: 'About & Education', x: -42, z: 16, flat: 11, discover: 12, arrive: [9, 6], color: '#e8a36b' },
  { id: 'skills', title: 'Crystal Circle', subtitle: 'Skills', x: 42, z: 14, flat: 12, discover: 13, arrive: [-10, 9], color: '#7fd6c2' },
  { id: 'projects', title: 'Project Grove', subtitle: 'Projects', x: 0, z: -26, flat: 15, discover: 16, arrive: [0, 15], color: '#9fb8ff' },
  { id: 'achievements', title: 'Hall of Trophies', subtitle: 'Hackathons & Achievements', x: -50, z: -46, flat: 11, discover: 12, arrive: [12, 5], color: '#ffd27a' },
  { id: 'certifications', title: 'Banner Ridge', subtitle: 'Certifications', x: 50, z: -44, flat: 10, discover: 11, arrive: [-12, 5], color: '#e39bd0' },
  { id: 'contact', title: 'Lakeside Camp', subtitle: 'Contact', x: -4, z: -78, flat: 10, discover: 12, arrive: [-2, 10], color: '#ff9f6b' },
];

export const zoneById = Object.fromEntries(zones.map((z) => [z.id, z])) as Record<ZoneId, ZoneDef>;

/** Project pedestals inside the grove — each opens a single project. */
export const projectPedestals = [
  { projectId: 'payproof', x: -10.5, z: -30 },
  { projectId: 'phishguard', x: -3.6, z: -35.5 },
  { projectId: 'aadhaar', x: 3.6, z: -35.5 },
  { projectId: 'nordicguard', x: 10.5, z: -30 },
];

export interface Lake {
  x: number;
  z: number;
  r: number;
  depth: number;
}

export const lakes: Lake[] = [
  { x: 36, z: -86, r: 24, depth: 4.2 },
  { x: -78, z: 44, r: 12, depth: 2.6 },
];

/** Paths as control points (Catmull-Rom smoothed at build time). */
export const pathRoutes: [number, number][][] = [
  // spawn → gate → grove → camp
  [[0, 70], [2, 58], [0, 44], [-3, 26], [2, 8], [0, -11], [0, -26], [-2, -44], [2, -60], [-4, -78]],
  // gate → cabin
  [[0, 44], [-12, 38], [-26, 28], [-42, 16]],
  // gate → crystals
  [[0, 44], [14, 36], [28, 26], [42, 14]],
  // grove → trophies
  [[0, -26], [-16, -30], [-34, -40], [-50, -46]],
  // grove → banners
  [[0, -26], [16, -30], [34, -38], [50, -44]],
  // cabin → trophies (outer loop)
  [[-42, 16], [-54, 0], [-58, -22], [-50, -46]],
  // loop → village square
  [[-54, 0], [-64, -6], [-74, -10], [-80, -12]],
  [[-58, -22], [-68, -18], [-78, -14]],
  // crystals → banners (outer loop)
  [[42, 14], [56, -4], [58, -26], [50, -44]],
];

export const SPAWN = { x: 0, z: 66, facing: Math.PI };

/** A small medieval village west of the cabin (decorative, with houses you can walk between). */
export const VILLAGE = { x: -78, z: -12, r: 20 };

/** Village buildings: model name, local position, rotation (radians), scale. */
export const villageBuildings: { model: string; x: number; z: number; rot: number; scale: number }[] = [
  { model: 'Inn', x: -80, z: 2, rot: Math.PI * 0.5, scale: 2.6 },
  { model: 'BellTower', x: -90, z: -12, rot: Math.PI * 0.5, scale: 3 },
  { model: 'House_2', x: -70, z: -26, rot: -Math.PI * 0.15, scale: 2.9 },
  { model: 'House_3', x: -86, z: -28, rot: Math.PI * 0.2, scale: 2.8 },
  { model: 'House_1', x: -66, z: 6, rot: Math.PI, scale: 3.2 },
  { model: 'House_2', x: -96, z: 4, rot: Math.PI * 0.6, scale: 2.7 },
  { model: 'House_3', x: -66, z: -37, rot: -Math.PI * 0.4, scale: 2.6 },
];

export const villageProps: { model: string; x: number; z: number; rot: number; scale: number; collide?: number }[] = [
  { model: 'Well', x: -77, z: -12, rot: 0.3, scale: 2.6, collide: 1.2 },
  { model: 'MarketStand', x: -71, z: -8, rot: -Math.PI / 2, scale: 2.4, collide: 1.1 },
  { model: 'MarketStand', x: -71, z: -15, rot: -Math.PI / 2, scale: 2.4, collide: 1.1 },
  { model: 'Cart', x: -83, z: -4, rot: 1.1, scale: 2.4, collide: 1.2 },
  { model: 'Bench', x: -76, z: -18, rot: 0, scale: 3, collide: 0.9 },
  { model: 'Bench', x: -81, z: -18, rot: 0.2, scale: 3, collide: 0.9 },
  { model: 'Barrel', x: -73, z: 0, rot: 0, scale: 6, collide: 0.55 },
  { model: 'Barrel', x: -74, z: 1.2, rot: 1, scale: 6, collide: 0.55 },
  { model: 'Barrel', x: -84, z: -22, rot: 0.4, scale: 6, collide: 0.55 },
];

/** Enemy outposts — scattered away from the portfolio stations so reading is never interrupted. */
export const enemySpawns: { x: number; z: number; type: 'grunt' | 'hazmat' }[] = [
  { x: 40, z: 56, type: 'grunt' },
  { x: -52, z: 54, type: 'hazmat' },
  { x: 76, z: 30, type: 'grunt' },
  { x: 80, z: -18, type: 'hazmat' },
  { x: -66, z: -16, type: 'grunt' },
  { x: -86, z: -40, type: 'grunt' },
  { x: -30, z: -64, type: 'hazmat' },
];

export const healthPickups: [number, number][] = [
  [18, 30], [-24, 36], [60, 0], [-62, -30], [24, -58], [-16, -40], [72, -40],
];

/** Extra flattened areas (village, outposts) for the terrain generator. */
export const extraFlats: { x: number; z: number; r: number }[] = [
  { x: VILLAGE.x, z: VILLAGE.z, r: VILLAGE.r },
  ...enemySpawns.map((e) => ({ x: e.x, z: e.z, r: 5 })),
];

export type TimeOfDay = 'morning' | 'day' | 'sunset' | 'night';
export const TIMES: TimeOfDay[] = ['morning', 'day', 'sunset', 'night'];
