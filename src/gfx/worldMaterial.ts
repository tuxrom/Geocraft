import * as THREE from 'three';
import { buildAtlas } from './textures';
import { ATLAS_COLS, ATLAS_ROWS } from '../data/blocks';

export interface WorldUniforms {
  fogColor: { value: THREE.Color };
  fogNear: { value: number };
  fogFar: { value: number };
  dayLight: { value: number };
  tint: { value: THREE.Color };
  time: { value: number };
}

const vert = /* glsl */ `
attribute float tile;
attribute float light;
varying vec2 vUv;
varying float vTile;
varying float vLight;
varying float vDist;
void main() {
  vUv = uv;
  vTile = tile;
  vLight = light;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float dayLight;
uniform vec3 tint;
uniform float water;
uniform float time;
varying vec2 vUv;
varying float vTile;
varying float vLight;
varying float vDist;
void main() {
  vec2 uvw = vUv;
  if (water > 0.5) { uvw += vec2(time * 0.05, time * 0.035); }
  vec2 f = clamp(fract(uvw), 0.002, 0.998);
  float col = mod(vTile + 0.5, ${ATLAS_COLS}.0);
  float row = floor((vTile + 0.5) / ${ATLAS_COLS}.0);
  vec2 auv = (vec2(floor(col), row) + f) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
  vec4 t = texture2D(map, auv);
  if (water < 0.5 && t.a < 0.5) discard;
  float l = vLight * dayLight;
  vec3 c = t.rgb * l * tint;
  float fog = smoothstep(fogNear, fogFar, vDist);
  gl_FragColor = vec4(mix(c, fogColor, fog), water > 0.5 ? t.a : 1.0);
}`;

export const worldUniforms: WorldUniforms = {
  fogColor: { value: new THREE.Color(0.6, 0.75, 1) },
  fogNear: { value: 60 },
  fogFar: { value: 120 },
  dayLight: { value: 1 },
  tint: { value: new THREE.Color(1, 1, 1) },
  time: { value: 0 },
};

export function makeWorldMaterials(): { opaque: THREE.ShaderMaterial; water: THREE.ShaderMaterial } {
  const atlas = buildAtlas();
  const mk = (water: number) => new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      map: { value: atlas.texture },
      water: { value: water },
      ...worldUniforms,
    },
    transparent: water > 0.5,
    depthWrite: water < 0.5,
    side: THREE.FrontSide,
  });
  return { opaque: mk(0), water: mk(1) };
}
