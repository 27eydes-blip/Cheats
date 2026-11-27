import * as THREE from 'three';

// Two-cascade sun shadows (Ultra). A second, shadow-only directional light
// covers the ~30 m around the camera with its own sharp map; the main sun
// keeps the wide map. The shared lighting chunk is patched so the sun's shadow
// term reads the near cascade where it is valid and fades to the far one at
// its edge. The near light has zero intensity: it exists only for its map,
// and must be added to the scene before the sun so it gets shadow index 0.
let patched = false;
export function patchCascadeChunk() {
  if (patched) return;
  patched = true;
  const src = THREE.ShaderChunk.lights_fragment_begin;
  const line = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  if (!src.includes(line)) { console.warn('[cascades] lighting chunk changed; cascades disabled'); return; }
  const repl = `#if NUM_DIR_LIGHT_SHADOWS >= 2
		#if ( UNROLLED_LOOP_INDEX == 1 )
		{
			float deShN = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
			float deShF = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
			vec3 deC = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
			float deEdge = min( min( deC.x, 1.0 - deC.x ), min( deC.y, 1.0 - deC.y ) );
			float deNear = smoothstep( 0.0, 0.1, deEdge ) * step( deC.z, 1.0 );
			directLight.color *= ( directLight.visible && receiveShadow ) ? mix( deShF, deShN, deNear ) : 1.0;
		}
		#endif
		#else
		${line}
		#endif`;
  THREE.ShaderChunk.lights_fragment_begin = src.replace(line, repl);
}

export function makeNearCascade(size = 2048, range = 28) {
  const l = new THREE.DirectionalLight(0xffffff, 0);
  l.castShadow = true;
  l.shadow.mapSize.set(size, size);
  const c = l.shadow.camera;
  c.left = -range; c.right = range; c.top = range; c.bottom = -range; c.near = 1; c.far = 600;
  l.shadow.bias = -0.0003;
  l.shadow.normalBias = 0.02;
  l.name = 'sun-near-cascade';
  return l;
}
