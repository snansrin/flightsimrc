import type { MeshLambertMaterial } from 'three'

export function addGroundGrain(shader: Parameters<MeshLambertMaterial['onBeforeCompile']>[0]) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGroundMeters;\nvarying vec3 vGroundView;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundMeters = position.xz;\nvGroundView = mvPosition.xyz;')
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec2 vGroundMeters;
    varying vec3 vGroundView;
    float groundHash(vec2 p) {
      vec3 q = fract(vec3(p.xyx) * .1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
  `).replace('#include <color_fragment>', `#include <color_fragment>
    float groundFade = 1.0 - smoothstep(12.0, 105.0, length(vGroundView));
    vec2 grain = vGroundMeters * 4.0;
    float grainWeight = 1.0 - smoothstep(.31, .95, max(fwidth(grain.x), fwidth(grain.y)));
    diffuseColor.rgb *= 1.0 + (groundHash(floor(grain)) - .5) * .23 * groundFade * grainWeight;
  `)
}
