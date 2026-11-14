/* Pocket Gridiron: GLSL shaders for the 3D renderer.
   render3d.js asks this file for four things: the turf, the sky dome, the crowd in the stands and a rim light
   that is patched into the players' materials. Everything is procedural, so there are still no image files.
   
   Colors given as uniforms are THREE.Color (linear working space); every shader converts to the screen's
   color space at the end with three's own colorspace chunk. */
(() => {
  'use strict';
  const T = window.THREE;
  if (!T) return;

  /* shared noise: a cheap hash, value noise and a three-octave fractal sum */
  const NOISE = /* glsl */ `
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) { return noise(p) * 0.5 + noise(p * 2.03 + 7.1) * 0.3 + noise(p * 4.1 + 3.7) * 0.2; }
  `;

  /* ---------- turf ----------
     The painted field texture carries the lines, numbers and end zones. The shader adds what a texture cannot:
     blade-scale detail near the camera (faded out with distance so it never shimmers), slow mottling, mowing
     stripes that brighten or darken with the viewing angle like real cut grass, and on a wet night the
     stretched reflections of the four light towers. */
  function turf(map) {
    const m = new T.ShaderMaterial({
      fog: true,
      uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
        map: { value: null }, uTint: { value: new T.Color(1, 1, 1) }, uWet: { value: 0 }, uSnow: { value: 0 }, uLamp: { value: 1 },
        uSky: { value: new T.Color(0.1, 0.13, 0.2) }, uTowers: { value: [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()] },
      }]),
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 uTint; uniform float uWet; uniform float uSnow; uniform float uLamp; uniform vec3 uSky; uniform vec3 uTowers[4];
        varying vec2 vUv; varying vec3 vWorld;
        #include <common>
        #include <fog_pars_fragment>
        ${NOISE}
        void main() {
          vec3 c = texture2D(map, vUv).rgb;
          vec2 p = vWorld.xz;
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          float paint = smoothstep(0.45, 0.85, lum);                       // white lines and numbers take less grain
          float near = 1.0 - smoothstep(14.0, 60.0, dist);
          float blades = noise(p * vec2(26.0, 10.0)) * 0.6 + noise(p * vec2(55.0, 21.0)) * 0.4;
          float patches = noise(p * 0.33) * 0.6 + noise(p * 1.2) * 0.4 * (1.0 - smoothstep(40.0, 120.0, dist));
          c *= 1.0 + ((blades - 0.5) * 0.26 * near + (patches - 0.5) * 0.11) * (1.0 - paint * 0.7) * (1.0 - uSnow * 0.6);
          /* mowing stripes: every other five-yard band leans the other way, so which ones look light depends on where you stand */
          float y = -vWorld.z, inField = step(0.0, y) * step(y, 100.0) * step(0.0, vWorld.x) * step(vWorld.x, 53.33);
          float band = mod(floor(y / 5.0), 2.0) * 2.0 - 1.0;
          c *= 1.0 + band * V.z * 0.07 * inField * (1.0 - paint) * (1.0 - uSnow);
          /* rain: the turf picks up the sky at grazing angles and the towers leave long streaks */
          if (uWet > 0.0) {
            /* the wet surface ripples smoothly: sums of sines, not the lattice noise, whose cells showed in the
               towers' reflection as a patch of blocks */
            vec2 w = vec2(sin(p.x * 1.9 + sin(p.y * 1.3) * 1.7) + 0.5 * sin(p.y * 4.3 + p.x * 2.1), sin(p.y * 1.6 + sin(p.x * 1.1) * 1.9) + 0.5 * sin(p.x * 3.7 - p.y * 2.9));
            vec3 N = normalize(vec3(w.x * 0.034, 1.0, w.y * 0.034));
            float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
            c = mix(c, uSky, fres * 0.45 * uWet);
            vec3 R = reflect(-V, N);
            float spec = 0.0;
            for (int i = 0; i < 4; i++) spec += pow(max(dot(R, normalize(uTowers[i] - vWorld)), 0.0), 110.0);
            c += vec3(0.85, 0.92, 1.0) * spec * 0.42 * uWet * uLamp;
          }
          gl_FragColor = vec4(min(c * uTint, vec3(0.86)), 1.0);     // stays under the glow threshold: lamps bloom, yard lines do not
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    m.uniforms.map.value = map;  // set after the merge above, which would have cloned the texture
    return m;
  }

  /* ---------- sky ----------
     A dome that follows the camera: a three-stop gradient, a sun with a soft halo, stars that twinkle at night
     and drifting clouds. uCloud is how much of the sky they cover; 1 is a full overcast. */
  function sky() {
    return new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: {
        uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uHorizon: { value: new T.Color() },
        uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunCol: { value: new T.Color(0, 0, 0) }, uCloudCol: { value: new T.Color(1, 1, 1) },
        uStars: { value: 1 }, uCloud: { value: 0.3 }, uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uCloudCol;
        uniform float uStars; uniform float uCloud; uniform float uTime;
        varying vec3 vDir;
        ${NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
          c = mix(c, uTop, smoothstep(0.18, 0.75, h));
          float sd = max(dot(d, uSunDir), 0.0);
          c += uSunCol * (pow(sd, 420.0) * 3.0 + pow(sd, 14.0) * 0.28 + pow(sd, 3.0) * 0.06);
          if (uStars > 0.0) {
            vec2 sp = d.xz / (d.y + 0.4) * 70.0, cell = floor(sp);
            float r = hash(cell);
            vec2 f = fract(sp) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
            float star = smoothstep(0.10, 0.0, length(f)) * step(0.86, r) * (0.7 + 0.3 * sin(uTime * 2.0 + r * 60.0));
            c += star * uStars * smoothstep(0.04, 0.3, d.y) * (0.5 + r * 0.6);
          }
          if (uCloud > 0.0) {
            vec2 cp = d.xz / (d.y + 0.15) * 1.5 + vec2(uTime * 0.006, uTime * 0.002);
            float n = fbm(cp) * 0.75 + fbm(cp * 2.7 + 11.0) * 0.25;
            float cover = smoothstep(1.0 - uCloud * 0.75, 1.0 - uCloud * 0.75 + 0.3, n + uCloud * 0.35);
            vec3 lit = uCloudCol * (0.72 + 0.28 * smoothstep(0.3, 0.9, n)) + uSunCol * pow(sd, 6.0) * 0.35;
            c = mix(c, lit, cover * smoothstep(0.0, 0.14, d.y) * (0.55 + 0.45 * min(uCloud, 1.0)));
          }
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
  }

  /* ---------- crowd ----------
     Every seat is worked out in the shader: taken or empty, shirt color (the two teams' colors show up in the
     mix), a head, and when the crowd erupts each fan hops on its own beat and half of them throw their arms up.
     Far from the camera a seat is smaller than a pixel, so the pattern fades to its average instead of shimmering. */
  function crowd() {
    return new T.ShaderMaterial({
      side: T.DoubleSide, fog: true, extensions: { derivatives: true },
      uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
        uA1: { value: new T.Color() }, uA2: { value: new T.Color() }, uB1: { value: new T.Color() },
        uCheer: { value: 0 }, uBase: { value: 0.6 }, uTime: { value: 0 },
      }]),
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uA1; uniform vec3 uA2; uniform vec3 uB1; uniform float uCheer; uniform float uBase; uniform float uTime;
        varying vec2 vUv;
        #include <common>
        #include <fog_pars_fragment>
        ${NOISE}
        vec3 shirt(float r) {
          if (r < 0.24) return uA1;
          if (r < 0.33) return uA2;
          if (r < 0.43) return uB1;
          if (r < 0.60) return vec3(0.66, 0.70, 0.78);
          if (r < 0.72) return vec3(0.22, 0.26, 0.36);
          if (r < 0.82) return vec3(0.42, 0.08, 0.12);
          if (r < 0.92) return vec3(0.10, 0.22, 0.50);
          return vec3(0.05, 0.07, 0.12);
        }
        void main() {
          vec2 g = vUv * vec2(30.0, 13.0), cell = floor(g), f = fract(g);
          float r = hash(cell), r2 = hash(cell + 31.7), r3 = hash(cell + 77.1);
          float aisle = step(mod(cell.x, 9.0), 0.5);
          float here = step(r3, 0.88) * (1.0 - aisle);
          float hop = uCheer * abs(sin(uTime * (5.0 + r2 * 3.0) + r * 6.2832)) * 0.2;
          vec2 q = vec2(f.x, f.y - hop);
          float body = step(0.14, q.x) * step(q.x, 0.86) * step(0.05, q.y) * step(q.y, 0.52);
          float head = 1.0 - smoothstep(0.13, 0.17, length((q - vec2(0.5, 0.66)) * vec2(1.0, 0.8)));
          float arms = uCheer * step(0.5, r2) * (step(abs(q.x - 0.2), 0.07) + step(abs(q.x - 0.8), 0.07)) * step(0.5, q.y) * step(q.y, 0.92);
          vec3 seat = mix(vec3(0.030, 0.045, 0.085), vec3(0.055, 0.075, 0.125), step(0.9, f.y));
          vec3 skin = mix(vec3(0.70, 0.52, 0.42), vec3(0.40, 0.28, 0.21), step(0.5, r2));
          vec3 c = mix(seat, shirt(r), body * here);
          c = mix(c, skin, min(1.0, head + arms) * here);
          float fw = max(fwidth(g.x), fwidth(g.y));
          vec3 avg = mix(seat, mix(shirt(hash(floor(g / 3.0))), vec3(0.30, 0.33, 0.40), 0.55), 0.45);
          c = mix(c, avg, smoothstep(0.3, 1.0, fw));
          gl_FragColor = vec4(c * uBase * (1.0 + 0.4 * uCheer), 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
  }

  /* ---------- players ----------
     A rim light: surfaces that turn away from the camera pick up the color of the stadium lights or the sky, which
     lifts the figures off the turf. It is added to three's own Lambert and Phong shaders rather than replacing them,
     so instancing, per-player colors and fog keep working. All materials share one uniform. */
  const rimColor = { value: new T.Color(0.4, 0.45, 0.55) };

  function rim(material) {
    material.onBeforeCompile = shader => {
      shader.uniforms.uRim = rimColor;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
        .replace('#include <opaque_fragment>', `
          float rimAmount = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
          outgoingLight += uRim * rimAmount;
          #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'pg-rim';
    return material;
  }

  /* ---------- finishing pass ----------
     The scene is drawn into an off-screen target (with 4x anti-aliasing), then three small programs run over it:
     keep only the brightest pixels, blur them at a quarter of the size, and add that glow back with a soft
     vignette and a little extra color. Lamps, wet turf and white helmets bloom; everything else is untouched.
     Returns null when the device cannot do it, and the renderer then draws straight to the screen. */
  function post(renderer) {
    try {
      const target = (w, h, opts) => {
        const rt = new T.WebGLRenderTarget(w, h, Object.assign({ depthBuffer: false, stencilBuffer: false }, opts));
        rt.texture.colorSpace = T.SRGBColorSpace;  // stored gamma-encoded, so dark night scenes keep their gradation in 8 bits
        return rt;
      };
      const full = target(4, 4, { depthBuffer: true, stencilBuffer: true, samples: 4 }), a = target(2, 2), b = target(2, 2);
      const tri = new T.Mesh(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)));
      tri.frustumCulled = false;
      const stage = new T.Scene(), cam = new T.Camera();
      stage.add(tri);
      const VS = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      const pass = (fragmentShader, uniforms) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader, uniforms, depthTest: false, depthWrite: false });
      const bright = pass( /* glsl */ `
        uniform sampler2D tex; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tex, vUv).rgb;
          gl_FragColor = vec4(c * smoothstep(0.88, 1.0, max(c.r, max(c.g, c.b))), 1.0);
        }`, { tex: { value: null } });
      const blur = pass( /* glsl */ `
        uniform sampler2D tex; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tex, vUv).rgb * 0.227;
          c += (texture2D(tex, vUv + uDir * 1.385).rgb + texture2D(tex, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tex, vUv + uDir * 3.231).rgb + texture2D(tex, vUv - uDir * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }`, { tex: { value: null }, uDir: { value: new T.Vector2() } });
      const out = pass( /* glsl */ `
        uniform sampler2D tex; uniform sampler2D glow; uniform float uGlow; uniform float uVignette; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tex, vUv).rgb + texture2D(glow, vUv).rgb * uGlow;
          c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.1);
          vec2 q = vUv - 0.5;
          c *= 1.0 - uVignette * smoothstep(0.18, 0.75, dot(q, q) * 1.6);
          gl_FragColor = vec4(max(c, 0.0), 1.0);
          #include <colorspace_fragment>
        }`, { tex: { value: null }, glow: { value: null }, uGlow: { value: 0.8 }, uVignette: { value: 0.32 } });
      const run = (material, to) => {
        tri.material = material;
        renderer.setRenderTarget(to);
        renderer.render(stage, cam);
      };
      const size = new T.Vector2();
      return {
        glow: out.uniforms.uGlow,
        render(scene, camera) {
          renderer.getDrawingBufferSize(size);
          if (full.width !== size.x || full.height !== size.y) {
            full.setSize(size.x, size.y);
            const w = Math.max(2, size.x >> 2), h = Math.max(2, size.y >> 2);
            a.setSize(w, h);
            b.setSize(w, h);
          }
          renderer.setRenderTarget(full);
          renderer.render(scene, camera);
          bright.uniforms.tex.value = full.texture;
          run(bright, a);
          for (let i = 0; i < 2; i++) {
            // two rounds of a separable blur, the second one wider
            const r = 1 + i * 1.6;
            blur.uniforms.tex.value = a.texture;
            blur.uniforms.uDir.value.set(r / a.width, 0);
            run(blur, b);
            blur.uniforms.tex.value = b.texture;
            blur.uniforms.uDir.value.set(0, r / a.height);
            run(blur, a);
          }
          out.uniforms.tex.value = full.texture;
          out.uniforms.glow.value = a.texture;
          run(out, null);
        },
      };
    } catch (e) {
      console.warn('finishing pass unavailable', e);
      return null;
    }
  }

  PG.shaders = { turf, sky, crowd, rim, rimColor, post };
})();
