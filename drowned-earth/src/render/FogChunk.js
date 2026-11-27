import * as THREE from 'three';

// Fog override. For THREE.Fog (used by the near world) `near` is an exp²
// density and `far` is the chunk-streaming distance where geometry dissolves
// into the haze. FogExp2 (far layer) keeps standard behaviour.
THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = 1.0 - exp( - fogNear * fogNear * vFogDepth * vFogDepth );
    #ifndef FOG_NO_STREAM_FADE
      fogFactor = max( fogFactor, smoothstep( fogFar * 0.72, fogFar, vFogDepth ) );
    #endif
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
