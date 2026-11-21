import type { MeshPhysicalMaterial } from 'three'

type Shader = Parameters<MeshPhysicalMaterial['onBeforeCompile']>[0]

function addPanelDetails(shader: Shader, wing: boolean) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPanelUv;\nvarying vec3 vPanelView;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvPanelUv = uv;\nvPanelView = mvPosition.xyz;')
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPanelUv;\nvarying vec3 vPanelView;')
    .replace('#include <color_fragment>', `#include <color_fragment>
    vec2 panel = vPanelUv;
    float panelFade = (1.0 - smoothstep(4.5,18.0,length(vPanelView))) *
      (1.0 - smoothstep(.0015,.015,max(fwidth(panel.x),fwidth(panel.y))));
    ${wing ? `
      float section = min(abs(panel.x - .31),abs(panel.x - .73));
      float service = abs(panel.y - .46);
      float hatch = (1.0 - smoothstep(.001,.004,section)) * step(.18,panel.y) * step(panel.y,.76);
      hatch += (1.0 - smoothstep(.001,.004,service)) * step(.32,panel.x) * step(panel.x,.71);
      float rivets = (1.0 - smoothstep(.09,.21,abs(fract(panel.x * 56.0)-.5))) *
        (1.0 - smoothstep(.001,.004,abs(panel.y-.48))) * step(.32,panel.x) * step(panel.x,.71);
    ` : `
      float station = min(abs(panel.x-.46),min(abs(panel.x-.78),abs(panel.x-.91)));
      float hatch = 1.0 - smoothstep(.001,.004,station);
      float rivets = (1.0 - smoothstep(.1,.22,abs(fract(panel.y * 34.0)-.5))) *
        (1.0 - smoothstep(.001,.004,abs(panel.x-.922)));
    `}
    diffuseColor.rgb *= 1.0 - min(.32, .23 * hatch + .26 * rivets) * panelFade;
  `)
}

export const addFuselageFinish = (shader: Shader) => addPanelDetails(shader, false)
export const addWingFinish = (shader: Shader) => addPanelDetails(shader, true)
