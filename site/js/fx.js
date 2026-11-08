/* FX — WebGL compositor for the film.
   Two video layers (for dissolves), digital-twin scan (Sobel edges + blueprint grid),
   velocity chromatic aberration, flashlight torch, darkness. Falls back to 2D if no WebGL. */
window.FX = (() => {
  let gl, prog, U = {}, tex = [], texSrc = [null, null], ok = false;

  const VS = `attribute vec2 p; varying vec2 vUv;
  void main(){ vUv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;

  const FS = `precision highp float;
  varying vec2 vUv;
  uniform sampler2D t0, t1; uniform vec4 r0, r1; uniform float a0, a1;
  uniform vec2 res; uniform float time, dark, scanA, scanB, ab, torchAmt; uniform vec3 torch;
  vec3 S(sampler2D t, vec4 r, vec2 uv){ return texture2D(t, r.xy + clamp(uv, 0., 1.) * r.zw).rgb; }
  vec3 SA(sampler2D t, vec4 r, vec2 uv){
    vec2 d = (uv - .5) * ab / res * 2.;
    return vec3(S(t, r, uv + d).r, S(t, r, uv).g, S(t, r, uv - d).b);
  }
  float L(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  void main(){
    vec2 uv = vUv;
    vec3 col = vec3(0.);
    if (a0 > 0.) col = mix(col, SA(t0, r0, uv), a0);
    if (a1 > 0.) col = mix(col, SA(t1, r1, uv), a1);

    // ---- digital twin band between the two scan lines ----
    if (uv.x < scanA && uv.x > scanB) {
      vec2 px = 1.25 / res;
      float tl = L(S(t0,r0,uv+vec2(-px.x,-px.y))), tc = L(S(t0,r0,uv+vec2(0.,-px.y))), tr = L(S(t0,r0,uv+vec2(px.x,-px.y)));
      float ml = L(S(t0,r0,uv+vec2(-px.x,0.))),                                         mr = L(S(t0,r0,uv+vec2(px.x,0.)));
      float bl = L(S(t0,r0,uv+vec2(-px.x,px.y))),  bc = L(S(t0,r0,uv+vec2(0.,px.y))),  br = L(S(t0,r0,uv+vec2(px.x,px.y)));
      float gx = -tl - 2.*ml - bl + tr + 2.*mr + br;
      float gy = -tl - 2.*tc - tr + bl + 2.*bc + br;
      float e = smoothstep(.06, .32, length(vec2(gx, gy)));
      float lum = L(col);
      vec3 base = vec3(.025, .02, .07) + lum * vec3(.09, .07, .22);
      vec2 g = fract(uv * res / 46.);
      float grid = (step(g.x, .025) + step(g.y, .025)) * .07;
      vec2 gc = floor(uv * res / 46.);
      float blink = step(.985, hash(gc + floor(time * 2.))) * .35;          // data cells lighting up
      col = base + grid * vec3(.55, .45, 1.) + blink * vec3(.4, .3, 1.) * step(.4, g.x) * step(.4, g.y) * step(g.x, .6) * step(g.y, .6)
          + e * mix(vec3(.54, .87, 1.), vec3(.75, .65, 1.), uv.y) * 1.25;
    }
    // scan line glows
    float xa = abs(uv.x - scanA) * res.x, xb = abs(uv.x - scanB) * res.x;
    if (scanA > 0. && scanA < 1.05) col += vec3(.54, .87, 1.) * (exp(-xa / 1.6) + .35 * exp(-xa / 26.));
    if (scanB > 0. && scanB < 1.05) col += vec3(.62, .5, 1.) * (exp(-xb / 1.6) + .35 * exp(-xb / 26.));

    // ---- darkness + flashlight ----
    vec3 base = col;
    col *= 1. - dark;
    if (torchAmt > 0.) {
      float d = distance(uv * res, torch.xy);
      float f = exp(-pow(d / torch.z, 2.));
      vec3 lit = base * (.05 + 1.9 * f) + vec3(1., .78, .5) * f * .035;
      col = mix(col, lit, torchAmt);
    }
    gl_FragColor = vec4(col, 1.);
  }`;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function init(canvas) {
    try {
      gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
      if (!gl) return false;
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['t0', 't1', 'r0', 'r1', 'a0', 'a1', 'res', 'time', 'dark', 'scanA', 'scanB', 'ab', 'torchAmt', 'torch']) U[n] = gl.getUniformLocation(prog, n);
      for (let i = 0; i < 2; i++) {
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        tex.push(t);
      }
      gl.uniform1i(U.t0, 0); gl.uniform1i(U.t1, 1);
      ok = true;
    } catch (e) { console.warn('FX: WebGL off', e); ok = false; }
    return ok;
  }
  function makeTexture() {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  function upload(t, src) {           // ImageBitmap -> texture: plain copy, no decode, no colour conversion
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (t._w === src.width && t._h === src.height) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src); // reuse storage
    else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); t._w = src.width; t._h = src.height; }
  }
  function bindLayer(i, L, VW, VH) {
    gl.activeTexture(gl.TEXTURE0 + i);
    if (L && L.tex) gl.bindTexture(gl.TEXTURE_2D, L.tex);
    else gl.bindTexture(gl.TEXTURE_2D, tex[i]);
    if (L && !L.tex && L.img && texSrc[i] !== L.img) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, L.img);
      texSrc[i] = L.img;
    }
    const V = L ? L.V : { x: 0, y: 0, w: VW, h: VH };
    gl.uniform4f(i ? U.r1 : U.r0, V.x / VW, V.y / VH, V.w / VW, V.h / VH);
    gl.uniform1f(i ? U.a1 : U.a0, L && L.img ? L.alpha : 0);
  }
  function render(s) {
    const c = gl.canvas;
    gl.viewport(0, 0, c.width, c.height);
    bindLayer(0, s.layers[0], s.VW, s.VH);
    bindLayer(1, s.layers[1], s.VW, s.VH);
    gl.uniform2f(U.res, c.width, c.height);
    gl.uniform1f(U.time, s.time); gl.uniform1f(U.dark, s.dark);
    gl.uniform1f(U.scanA, s.scanA); gl.uniform1f(U.scanB, s.scanB);
    gl.uniform1f(U.ab, s.ab); gl.uniform1f(U.torchAmt, s.torchAmt);
    gl.uniform3f(U.torch, s.torch[0], s.torch[1], s.torch[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return { init, render, makeTexture, upload, get ok() { return ok; } };
})();
