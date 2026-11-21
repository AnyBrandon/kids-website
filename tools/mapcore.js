/* mapcore.js - plain-number geometry + map code for probe2. No THREE, no DOM.
 * Works in the browser (window.MapCore) and in Node (require).
 *
 * CONVENTIONS (read this before touching anything)
 * ------------------------------------------------
 * XR (WebXR) camera/view space : +X right, +Y up, -Z forward. XRView.transform.matrix is a
 *                                 COLUMN-MAJOR 4x4 that maps view space -> session space (camera-to-world).
 * CV camera space              : +X right, +Y down, +Z forward (OpenCV). Pixel (u,v): u right, v DOWN, origin at
 *                                 the top-left corner of the top-left pixel (so centre of pixel 0 is 0.5; we ignore
 *                                 the half-pixel, it is far below the 3 px thresholds).
 * Conversion                   : p_cv = F * p_xr with F = diag(1,-1,-1).
 * Pose object                  : { R: [9 row-major], t: [3], C: [3] } is WORLD -> CV-CAMERA: x_cam = R*X + t,
 *                                 C = camera centre in world (session/map) space = -R^T t.
 * Intrinsics from projection   : for a WebGL column-major projection matrix P (XRView.projectionMatrix) and the
 *                                 camera image size W x H (XRCamera.width/height), derived from
 *                                   ndc_x = P[0]*xn - P[8],   ndc_y = -P[5]*yn - P[9],   (xn,yn = x/z, y/z in CV space)
 *                                   u = (ndc_x+1)/2*W,        v = (1-ndc_y)/2*H
 *                                 =>  fx = P[0]*W/2,  cx = (1-P[8])*W/2,  fy = P[5]*H/2,  cy = (1+P[9])*H/2.
 *                                 ASSUMPTION: the view projection describes the camera image (what Chrome's raw
 *                                 camera access does) and the image is stored top row first (v down).
 * Descriptors                  : ORB, 32 bytes each, Hamming distance.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MapCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DESC = 32;
  var DEG = 180 / Math.PI;

  // ---------- small linear algebra (row-major 3x3 as arrays of 9) ----------
  function mulMV(R, v) {
    return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  }
  function mulMTV(R, v) { // R^T * v
    return [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
  }
  function mulMM(A, B) {
    var o = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
      o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return o;
  }
  function transpose3(R) { return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function norm3(a) { return Math.sqrt(dot3(a, a)); }

  function rotAngleDeg(Ra, Rb) { // angle of Ra * Rb^T
    var M = mulMM(Ra, transpose3(Rb));
    var c = (M[0] + M[4] + M[8] - 1) / 2;
    return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
  }

  // Rotation vector (Rodrigues) -> row-major 3x3.
  function rodriguesToMatrix(r) {
    var th = norm3(r);
    if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    var x = r[0] / th, y = r[1] / th, z = r[2] / th, c = Math.cos(th), s = Math.sin(th), k = 1 - c;
    return [c + x * x * k, x * y * k - z * s, x * z * k + y * s,
            y * x * k + z * s, c + y * y * k, y * z * k - x * s,
            z * x * k - y * s, z * y * k + x * s, c + z * z * k];
  }
  // Row-major 3x3 -> rotation vector (used by tests / pose seeding).
  function matrixToRodrigues(R) {
    var c = Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2));
    var th = Math.acos(c);
    if (th < 1e-9) return [0, 0, 0];
    if (Math.PI - th < 1e-6) { // near 180 deg
      var x = Math.sqrt(Math.max(0, (R[0] + 1) / 2)), y = Math.sqrt(Math.max(0, (R[4] + 1) / 2)), z = Math.sqrt(Math.max(0, (R[8] + 1) / 2));
      if (R[1] < 0) y = -y; if (R[2] < 0) z = -z;
      return [x * th, y * th, z * th];
    }
    var k = th / (2 * Math.sin(th));
    return [(R[7] - R[5]) * k, (R[2] - R[6]) * k, (R[3] - R[1]) * k];
  }

  // ---------- XR <-> CV conversions ----------
  // m: XR camera-to-world, column-major 16 numbers.
  function xrMatrixToPose(m) {
    var p = [m[12], m[13], m[14]];
    // Rx (world->xr-camera) row i = column i of camera-to-world rotation = m[4i..4i+2]
    var Rx = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
    var R = [Rx[0], Rx[1], Rx[2], -Rx[3], -Rx[4], -Rx[5], -Rx[6], -Rx[7], -Rx[8]]; // F * Rx
    var t = [-dot3([R[0], R[1], R[2]], p), -dot3([R[3], R[4], R[5]], p), -dot3([R[6], R[7], R[8]], p)];
    return { R: R, t: t, C: p };
  }
  function poseToXrMatrix(pose) {
    var Rx = [pose.R[0], pose.R[1], pose.R[2], -pose.R[3], -pose.R[4], -pose.R[5], -pose.R[6], -pose.R[7], -pose.R[8]];
    var C = pose.C || mulMTV(pose.R, [-pose.t[0], -pose.t[1], -pose.t[2]]);
    return [Rx[0], Rx[1], Rx[2], 0, Rx[3], Rx[4], Rx[5], 0, Rx[6], Rx[7], Rx[8], 0, C[0], C[1], C[2], 1];
  }
  function poseFromRt(R, t) { return { R: R, t: t, C: mulMTV(R, [-t[0], -t[1], -t[2]]) }; }

  function intrinsicsFromProjection(P, W, H) {
    return { fx: P[0] * W / 2, fy: P[5] * H / 2, cx: (1 - P[8]) * W / 2, cy: (1 + P[9]) * H / 2, width: W, height: H };
  }
  // Inverse of the above, used by tests to fabricate a projection matrix.
  function projectionFromIntrinsics(K, W, H, near, far) {
    near = near || 0.1; far = far || 100;
    var P = new Array(16).fill(0);
    P[0] = 2 * K.fx / W; P[5] = 2 * K.fy / H; P[8] = 1 - 2 * K.cx / W; P[9] = 2 * K.cy / H - 1;
    P[10] = -(far + near) / (far - near); P[11] = -1; P[14] = -2 * far * near / (far - near);
    return P;
  }

  function project(K, pose, X) {
    var xc = mulMV(pose.R, X);
    xc[0] += pose.t[0]; xc[1] += pose.t[1]; xc[2] += pose.t[2];
    return { u: K.fx * xc[0] / xc[2] + K.cx, v: K.fy * xc[1] / xc[2] + K.cy, z: xc[2] };
  }

  // ---------- flip fix for WebGL readback ----------
  // readPixels returns the bottom row first. Convert RGBA to gray and (optionally) flip so row 0 is the top row.
  function rgbaToGray(rgba, width, height, out, flipY) {
    var n = width * height;
    if (!rgba || rgba.length < n * 4) throw new Error('rgbaToGray: buffer too small');
    var g = (out && out.length >= n) ? out : new Uint8Array(n);
    for (var y = 0; y < height; y++) {
      var sy = flipY ? (height - 1 - y) : y;
      var si = sy * width * 4, di = y * width;
      for (var x = 0; x < width; x++, si += 4) g[di + x] = (77 * rgba[si] + 150 * rgba[si + 1] + 29 * rgba[si + 2]) >> 8;
    }
    return g;
  }

  // ---------- keyframe selection ----------
  // prev: { pose, tMs } | null; cur: { pose, tMs }; o: { tracking, count, minDist, minAngDeg, minIntervalMs, maxKeyframes }
  function shouldCaptureKeyframe(prev, cur, o) {
    o = o || {};
    var minDist = o.minDist === undefined ? 0.15 : o.minDist;
    var minAng = o.minAngDeg === undefined ? 10 : o.minAngDeg;
    var minInt = o.minIntervalMs === undefined ? 500 : o.minIntervalMs;
    var maxKf = o.maxKeyframes === undefined ? 150 : o.maxKeyframes;
    if (!o.tracking) return { capture: false, reason: 'tracking not good' };
    if ((o.count || 0) >= maxKf) return { capture: false, reason: 'keyframe cap reached' };
    if (!prev) return { capture: true, reason: 'first keyframe', dist: 0, angDeg: 0 };
    if (cur.tMs - prev.tMs < minInt) return { capture: false, reason: 'too soon' };
    var d = norm3(sub3(cur.pose.C, prev.pose.C));
    var a = rotAngleDeg(cur.pose.R, prev.pose.R);
    if (d >= minDist || a >= minAng) return { capture: true, reason: d >= minDist ? 'moved' : 'rotated', dist: d, angDeg: a };
    return { capture: false, reason: 'not moved enough', dist: d, angDeg: a };
  }

  // ---------- epipolar geometry ----------
  // Distance (px) from point pj (in image j) to the epipolar line of pi (in image i). Poses are world->CV camera.
  function epipolarDistance(K, poseI, poseJ, ui, vi, uj, vj) {
    var Rrel = mulMM(poseJ.R, transpose3(poseI.R));
    var tr = mulMV(Rrel, poseI.t);
    var t = [poseJ.t[0] - tr[0], poseJ.t[1] - tr[1], poseJ.t[2] - tr[2]];
    var xi = [(ui - K.cx) / K.fx, (vi - K.cy) / K.fy, 1];
    var a = mulMV(Rrel, xi); // R x
    // l = t x (R x)  (E x = [t]x R x)
    var l = [t[1] * a[2] - t[2] * a[1], t[2] * a[0] - t[0] * a[2], t[0] * a[1] - t[1] * a[0]];
    var xj = [(uj - K.cx) / K.fx, (vj - K.cy) / K.fy, 1];
    var num = Math.abs(dot3(l, xj));
    var lp0 = l[0] / K.fx, lp1 = l[1] / K.fy;
    var den = Math.sqrt(lp0 * lp0 + lp1 * lp1);
    return den < 1e-12 ? Infinity : num / den;
  }

  // ---------- DLT triangulation (hand written; cv.triangulatePoints is missing in this build) ----------
  // Jacobi eigen-decomposition for a symmetric n x n matrix (array of arrays). Returns { values, vectors } (vectors[k] = k-th eigenvector).
  function jacobiEigen(A, n) {
    var V = [], i, j, k;
    for (i = 0; i < n; i++) { V.push(new Array(n).fill(0)); V[i][i] = 1; }
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = 0;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-30) break;
      for (var p = 0; p < n - 1; p++) for (var q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        var theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        var t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        var c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (k = 0; k < n; k++) { var akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (k = 0; k < n; k++) { var apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (k = 0; k < n; k++) { var vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    var values = [], vectors = [];
    for (i = 0; i < n; i++) { values.push(A[i][i]); var vec = []; for (k = 0; k < n; k++) vec.push(V[k][i]); vectors.push(vec); }
    return { values: values, vectors: vectors };
  }

  // obs: [{ pose, u, v }]; returns [X,Y,Z] or null. Uses normalised image coordinates so rows are well scaled.
  function triangulateDLT(obs, K) {
    if (obs.length < 2) return null;
    var AtA = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (var i = 0; i < obs.length; i++) {
      var o = obs[i], R = o.pose.R, t = o.pose.t;
      var xn = (o.u - K.cx) / K.fx, yn = (o.v - K.cy) / K.fy;
      var P1 = [R[0], R[1], R[2], t[0]], P2 = [R[3], R[4], R[5], t[1]], P3 = [R[6], R[7], R[8], t[2]];
      var r1 = [], r2 = [];
      for (var c = 0; c < 4; c++) { r1.push(xn * P3[c] - P1[c]); r2.push(yn * P3[c] - P2[c]); }
      for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) AtA[a][b] += r1[a] * r1[b] + r2[a] * r2[b];
    }
    var e = jacobiEigen(AtA, 4), best = 0;
    for (var k = 1; k < 4; k++) if (e.values[k] < e.values[best]) best = k;
    var v = e.vectors[best];
    if (Math.abs(v[3]) < 1e-12) return null;
    return [v[0] / v[3], v[1] / v[3], v[2] / v[3]];
  }

  function reprojError(K, pose, X, u, v) {
    var p = project(K, pose, X);
    if (!(p.z > 0)) return Infinity;
    return Math.sqrt((p.u - u) * (p.u - u) + (p.v - v) * (p.v - v));
  }
  function parallaxDeg(Ca, Cb, X) {
    var ra = sub3(X, Ca), rb = sub3(X, Cb);
    var c = dot3(ra, rb) / (norm3(ra) * norm3(rb));
    return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
  }

  // ---------- Hamming matching (brute force, 2-NN ratio test) ----------
  function u32(d) {
    if (d.byteOffset % 4 === 0 && d.byteLength % 4 === 0) return new Uint32Array(d.buffer, d.byteOffset, d.byteLength / 4);
    var c = new Uint8Array(d.length); c.set(d); return new Uint32Array(c.buffer);
  }
  function pc(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    x = (x + (x >>> 4)) & 0x0f0f0f0f;
    return Math.imul(x, 0x01010101) >>> 24;
  }
  function hamming(da, ia, db, ib) { // descriptor index in each array
    var a = u32(da), b = u32(db), s = 0, oa = ia * 8, ob = ib * 8;
    for (var k = 0; k < 8; k++) s += pc((a[oa + k] ^ b[ob + k]) >>> 0);
    return s;
  }
  // Returns { qi:[], ti:[], dist:[] } for query descriptors accepted by the ratio test against the train set.
  function matchHamming(dq, nq, dt, nt, ratio) {
    var out = { qi: [], ti: [], dist: [] };
    if (nq < 1 || nt < 2) return out;
    var q = u32(dq), t = u32(dt);
    for (var i = 0; i < nq; i++) {
      var qo = i * 8, q0 = q[qo], q1 = q[qo + 1], q2 = q[qo + 2], q3 = q[qo + 3], q4 = q[qo + 4], q5 = q[qo + 5], q6 = q[qo + 6], q7 = q[qo + 7];
      var d1 = 1e9, d2 = 1e9, bj = -1;
      for (var j = 0; j < nt; j++) {
        var to = j * 8;
        var d = pc((q0 ^ t[to]) >>> 0) + pc((q1 ^ t[to + 1]) >>> 0) + pc((q2 ^ t[to + 2]) >>> 0) + pc((q3 ^ t[to + 3]) >>> 0) +
                pc((q4 ^ t[to + 4]) >>> 0) + pc((q5 ^ t[to + 5]) >>> 0) + pc((q6 ^ t[to + 6]) >>> 0) + pc((q7 ^ t[to + 7]) >>> 0);
        if (d < d1) { d2 = d1; d1 = d; bj = j; } else if (d < d2) { d2 = d; }
      }
      if (bj >= 0 && d1 < ratio * d2) { out.qi.push(i); out.ti.push(bj); out.dist.push(d1); }
    }
    return out;
  }

  // ---------- stats ----------
  function statsSummary(arr) {
    var a = arr.filter(function (v) { return typeof v === 'number' && isFinite(v); }).sort(function (x, y) { return x - y; });
    var n = a.length;
    if (!n) return { n: 0, mean: null, median: null, p90: null, max: null };
    var sum = 0; for (var i = 0; i < n; i++) sum += a[i];
    var med = n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
    var p90 = a[Math.min(n - 1, Math.ceil(0.9 * n) - 1)];
    var r = function (v) { return Math.round(v * 100) / 100; };
    return { n: n, mean: r(sum / n), median: r(med), p90: r(p90), max: r(a[n - 1]) };
  }

  // ---------- map building ----------
  // kfs: [{ pose, n, xy: Float32Array(2n), desc: Uint8Array(32n) }]
  // returns { lm: { n, xyz: Float32Array(3n), desc: Uint8Array(32n), obs: Uint16Array(n) }, stats, coverage: [per-kf landmark counts] }
  async function buildMap(kfs, K, opts, hooks) {
    var t0 = Date.now();
    var o = Object.assign({ ratio: 0.75, epiPx: 3, reprojPx: 3, minParallaxDeg: 2, minDepth: 0.2, maxDepth: 10,
      neighbors: 4, minBaseline: 0.05, maxNeighborDist: 1.5, maxNeighborAngDeg: 45 }, opts || {});
    hooks = hooks || {};
    var yieldFn = hooks.yield || function () { return Promise.resolve(); };
    var progress = hooks.progress || function () {};
    var N = kfs.length, i, j;
    var st = { keyframes: N, pairs: 0, rawMatches: 0, afterEpipolar: 0, pairTriangulated: 0, tracks: 0, landmarks: 0,
      rejected: { epipolar: 0, reproj: 0, parallax: 0, depth: 0, inconsistentTrack: 0, trackTooShort: 0, trackReproj: 0, trackParallax: 0, trackDepth: 0 } };

    var off = new Int32Array(N + 1);
    for (i = 0; i < N; i++) off[i + 1] = off[i] + kfs[i].n;
    var total = off[N];
    var parent = new Int32Array(total), nodeKf = new Int32Array(total), nodeKp = new Int32Array(total);
    for (i = 0; i < N; i++) for (j = 0; j < kfs[i].n; j++) { parent[off[i] + j] = off[i] + j; nodeKf[off[i] + j] = i; nodeKp[off[i] + j] = j; }
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }

    // neighbour pairs
    var pairSet = {}, pairs = [];
    for (i = 0; i < N; i++) {
      var cand = [];
      for (j = 0; j < N; j++) {
        if (j === i) continue;
        var d = norm3(sub3(kfs[i].pose.C, kfs[j].pose.C));
        if (d < o.minBaseline || d > o.maxNeighborDist) continue;
        if (rotAngleDeg(kfs[i].pose.R, kfs[j].pose.R) > o.maxNeighborAngDeg) continue;
        cand.push({ j: j, d: d });
      }
      cand.sort(function (a, b) { return a.d - b.d; });
      for (var c = 0; c < Math.min(o.neighbors, cand.length); c++) {
        var a = Math.min(i, cand[c].j), b = Math.max(i, cand[c].j), key = a * N + b;
        if (!pairSet[key]) { pairSet[key] = 1; pairs.push([a, b]); }
      }
    }
    st.pairs = pairs.length;

    for (var pi = 0; pi < pairs.length; pi++) {
      var A = kfs[pairs[pi][0]], B = kfs[pairs[pi][1]];
      var m = matchHamming(A.desc, A.n, B.desc, B.n, o.ratio);
      st.rawMatches += m.qi.length;
      for (var k = 0; k < m.qi.length; k++) {
        var ia = m.qi[k], ib = m.ti[k];
        var ua = A.xy[2 * ia], va = A.xy[2 * ia + 1], ub = B.xy[2 * ib], vb = B.xy[2 * ib + 1];
        if (epipolarDistance(K, A.pose, B.pose, ua, va, ub, vb) > o.epiPx) { st.rejected.epipolar++; continue; }
        st.afterEpipolar++;
        var X = triangulateDLT([{ pose: A.pose, u: ua, v: va }, { pose: B.pose, u: ub, v: vb }], K);
        if (!X) { st.rejected.depth++; continue; }
        var pa = project(K, A.pose, X), pb = project(K, B.pose, X);
        if (!(pa.z >= o.minDepth && pa.z <= o.maxDepth && pb.z >= o.minDepth && pb.z <= o.maxDepth)) { st.rejected.depth++; continue; }
        if (reprojError(K, A.pose, X, ua, va) > o.reprojPx || reprojError(K, B.pose, X, ub, vb) > o.reprojPx) { st.rejected.reproj++; continue; }
        if (parallaxDeg(A.pose.C, B.pose.C, X) < o.minParallaxDeg) { st.rejected.parallax++; continue; }
        st.pairTriangulated++;
        union(off[pairs[pi][0]] + ia, off[pairs[pi][1]] + ib);
      }
      progress('matched pair ' + (pi + 1) + '/' + pairs.length);
      await yieldFn();
    }

    // group nodes into tracks
    var tracks = {}, node;
    var counts = new Int32Array(total);
    for (node = 0; node < total; node++) counts[find(node)]++;
    for (node = 0; node < total; node++) {
      var root = find(node);
      if (counts[root] < 2) continue;
      (tracks[root] || (tracks[root] = [])).push(node);
    }

    var lmXyz = [], lmDesc = [], lmObs = [], coverage = new Array(N).fill(0);
    var keys = Object.keys(tracks);
    st.tracks = keys.length;
    for (var ti = 0; ti < keys.length; ti++) {
      var nodes = tracks[keys[ti]], seen = {}, consistent = true, obs = [];
      for (var q = 0; q < nodes.length; q++) {
        var kf = nodeKf[nodes[q]];
        if (seen[kf]) { consistent = false; break; }
        seen[kf] = 1; obs.push({ kf: kf, kp: nodeKp[nodes[q]] });
      }
      if (!consistent) { st.rejected.inconsistentTrack++; continue; }
      var res = refineTrack(obs, kfs, K, o, st);
      if (!res) continue;
      var lm = res.obs, ox = res.X;
      lmXyz.push(ox[0], ox[1], ox[2]);
      lmObs.push(lm.length);
      // representative descriptor: medoid by summed Hamming distance
      var bestI = 0, bestS = Infinity;
      for (var a2 = 0; a2 < lm.length; a2++) {
        var s = 0;
        for (var b2 = 0; b2 < lm.length; b2++) if (a2 !== b2) s += hamming(kfs[lm[a2].kf].desc, lm[a2].kp, kfs[lm[b2].kf].desc, lm[b2].kp);
        if (s < bestS) { bestS = s; bestI = a2; }
      }
      var src = kfs[lm[bestI].kf].desc, so = lm[bestI].kp * DESC;
      for (var bb = 0; bb < DESC; bb++) lmDesc.push(src[so + bb]);
      for (var z = 0; z < lm.length; z++) coverage[lm[z].kf]++;
    }
    var n = lmObs.length;
    st.landmarks = n;
    st.buildMs = Date.now() - t0;
    var cs = statsSummary(coverage);
    st.coverage = { min: coverage.length ? Math.min.apply(null, coverage) : 0, mean: cs.mean, max: coverage.length ? Math.max.apply(null, coverage) : 0,
      zeroKeyframes: coverage.filter(function (v) { return v === 0; }).length };
    return { lm: { n: n, xyz: Float32Array.from(lmXyz), desc: Uint8Array.from(lmDesc), obs: Uint16Array.from(lmObs) }, stats: st, coverage: coverage };
  }

  function refineTrack(obsIn, kfs, K, o, st) {
    var cur = obsIn.slice(), X = null;
    function mk(ob) { var kf = kfs[ob.kf]; return { pose: kf.pose, u: kf.xy[2 * ob.kp], v: kf.xy[2 * ob.kp + 1] }; }
    while (cur.length >= 2) {
      X = triangulateDLT(cur.map(mk), K);
      if (!X) return (st.rejected.trackDepth++, null);
      var worst = -1, we = -1;
      for (var i = 0; i < cur.length; i++) {
        var m = mk(cur[i]), e = reprojError(K, m.pose, X, m.u, m.v);
        if (e > we) { we = e; worst = i; }
      }
      if (we <= o.reprojPx) break;
      cur.splice(worst, 1);
      X = null;
    }
    if (!X || cur.length < 2) { st.rejected[cur.length < 2 ? 'trackReproj' : 'trackTooShort']++; return null; }
    var maxPar = 0, k, l;
    for (k = 0; k < cur.length; k++) {
      var z = project(K, kfs[cur[k].kf].pose, X).z;
      if (!(z >= o.minDepth && z <= o.maxDepth)) { st.rejected.trackDepth++; return null; }
      for (l = k + 1; l < cur.length; l++) maxPar = Math.max(maxPar, parallaxDeg(kfs[cur[k].kf].pose.C, kfs[cur[l].kf].pose.C, X));
    }
    if (maxPar < o.minParallaxDeg) { st.rejected.trackParallax++; return null; }
    return { X: X, obs: cur };
  }

  // ---------- ORB extraction via opencv.js ----------
  function extractORB(cv, orb, gray, w, h) {
    var mat = new cv.Mat(h, w, cv.CV_8UC1), mask = new cv.Mat(), kps = new cv.KeyPointVector(), des = new cv.Mat();
    try {
      mat.data.set(gray);
      var t0 = (typeof performance !== 'undefined' ? performance : Date).now();
      orb.detectAndCompute(mat, mask, kps, des);
      var ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
      var n = kps.size(), xy = new Float32Array(2 * n);
      for (var i = 0; i < n; i++) { var p = kps.get(i).pt; xy[2 * i] = p.x; xy[2 * i + 1] = p.y; }
      var desc = n > 0 && des.rows === n ? new Uint8Array(des.data) : new Uint8Array(0);
      if (desc.length !== n * DESC) { n = Math.min(n, Math.floor(desc.length / DESC)); xy = xy.slice(0, 2 * n); desc = desc.slice(0, n * DESC); }
      return { n: n, xy: xy, desc: desc, ms: ms };
    } finally { mat.delete(); mask.delete(); kps.delete(); des.delete(); }
  }

  // ---------- localization (PnP RANSAC) ----------
  // Low-level: 3D points (flat xyz) + 2D points (flat uv) -> pose via cv.solvePnPRansac.
  function solvePnPRansac(cv, xyz, uv, K, o) {
    o = Object.assign({ reprojPx: 4, minInliers: 25, iterations: 200, confidence: 0.99 }, o || {});
    var n = uv.length / 2;
    if (n < 6) return { ok: false, inliers: 0, reason: 'too few correspondences (' + n + ')' };
    var obj = cv.matFromArray(n, 1, cv.CV_64FC3, Array.from(xyz));
    var img = cv.matFromArray(n, 1, cv.CV_64FC2, Array.from(uv));
    var cam = cv.matFromArray(3, 3, cv.CV_64FC1, [K.fx, 0, K.cx, 0, K.fy, K.cy, 0, 0, 1]);
    var dist = cv.Mat.zeros(4, 1, cv.CV_64FC1), rvec = new cv.Mat(), tvec = new cv.Mat(), inl = new cv.Mat();
    try {
      var ok = cv.solvePnPRansac(obj, img, cam, dist, rvec, tvec, false, o.iterations, o.reprojPx, o.confidence, inl, cv.SOLVEPNP_ITERATIVE);
      var ni = inl.rows;
      if (!ok || rvec.rows * rvec.cols < 3 || ni < 1) return { ok: false, inliers: ni || 0, reason: 'solvePnPRansac found no model' };
      var rv = [rvec.data64F[0], rvec.data64F[1], rvec.data64F[2]], tv = [tvec.data64F[0], tvec.data64F[1], tvec.data64F[2]];
      var idx = []; for (var i = 0; i < ni; i++) idx.push(inl.data32S[i]);
      var pose = poseFromRt(rodriguesToMatrix(rv), tv);
      if (ni < o.minInliers) return { ok: false, inliers: ni, pose: pose, inlierIdx: idx, reason: 'inliers ' + ni + ' < ' + o.minInliers };
      return { ok: true, inliers: ni, pose: pose, inlierIdx: idx };
    } finally { obj.delete(); img.delete(); cam.delete(); dist.delete(); rvec.delete(); tvec.delete(); inl.delete(); }
  }

  // frame: { n, xy, desc }; map: { n, xyz, desc }
  function localize(cv, map, frame, K, opts) {
    opts = Object.assign({ ratio: 0.75 }, opts || {});
    var t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    var res;
    try {
      var m = matchHamming(frame.desc, frame.n, map.desc, map.n, opts.ratio);
      var xyz = new Float64Array(m.qi.length * 3), uv = new Float64Array(m.qi.length * 2);
      for (var k = 0; k < m.qi.length; k++) {
        var li = m.ti[k], qi = m.qi[k];
        xyz[3 * k] = map.xyz[3 * li]; xyz[3 * k + 1] = map.xyz[3 * li + 1]; xyz[3 * k + 2] = map.xyz[3 * li + 2];
        uv[2 * k] = frame.xy[2 * qi]; uv[2 * k + 1] = frame.xy[2 * qi + 1];
      }
      res = solvePnPRansac(cv, xyz, uv, K, opts);
      res.matches = m.qi.length;
    } catch (e) {
      res = { ok: false, inliers: 0, matches: 0, reason: 'exception: ' + (e && e.message || e) };
    }
    res.ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
    return res;
  }

  // Translation error (cm) and rotation error (deg) between an estimated pose and a reference pose (both world->cam).
  function poseError(est, ref) {
    return { transCm: norm3(sub3(est.C, ref.C)) * 100, rotDeg: rotAngleDeg(est.R, ref.R) };
  }

  // ---------- map (de)serialisation ----------
  // map: { meta: {...}, K, keyframePoses: [16-number XR matrices], lm: { n, xyz, desc, obs } }
  // Binary layout: u32 jsonLen | json (padded to 4) | xyz f32[3n] | obs u16[n] (padded to 4) | desc u8[32n]
  function serializeMap(map) {
    var n = map.lm.n;
    var header = { format: 'armemos-map', version: 1, n: n, meta: map.meta || {}, K: map.K, keyframePoses: map.keyframePoses || [] };
    var json = new TextEncoder().encode(JSON.stringify(header));
    var jpad = (4 - (json.length % 4)) % 4, opad = (4 - ((n * 2) % 4)) % 4;
    var size = 4 + json.length + jpad + n * 12 + n * 2 + opad + n * DESC;
    var buf = new ArrayBuffer(size), dv = new DataView(buf), u8 = new Uint8Array(buf), p = 0;
    dv.setUint32(0, json.length, true); p = 4;
    u8.set(json, p); p += json.length + jpad;
    new Float32Array(buf, p, n * 3).set(map.lm.xyz.subarray(0, n * 3)); p += n * 12;
    new Uint16Array(buf, p, n).set(map.lm.obs.subarray(0, n)); p += n * 2 + opad;
    u8.set(map.lm.desc.subarray(0, n * DESC), p);
    return u8;
  }
  function deserializeMap(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var buf = u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer;
    var dv = new DataView(buf), jl = dv.getUint32(0, true);
    var header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
    if (header.format !== 'armemos-map') throw new Error('not an armemos map');
    var n = header.n, jpad = (4 - (jl % 4)) % 4, opad = (4 - ((n * 2) % 4)) % 4, p = 4 + jl + jpad;
    var xyz = new Float32Array(buf.slice(p, p + n * 12)); p += n * 12;
    var obs = new Uint16Array(buf.slice(p, p + n * 2)); p += n * 2 + opad;
    var desc = new Uint8Array(buf.slice(p, p + n * DESC));
    if (desc.length !== n * DESC) throw new Error('truncated map data');
    return { meta: header.meta, K: header.K, keyframePoses: header.keyframePoses, lm: { n: n, xyz: xyz, desc: desc, obs: obs } };
  }

  // ---------- report ----------
  function buildReport2(s) {
    s = s || {};
    var r1 = function (v) { return v === null || v === undefined ? null : Math.round(v * 10) / 10; };
    var loc = s.locAttempts || [];
    var okN = loc.filter(function (a) { return a.ok; }).length;
    return {
      build: s.build || null,
      time: new Date().toISOString(),
      userAgent: s.userAgent || null,
      enabledFeatures: s.enabledFeatures || null,
      cameraSize: s.camera && s.camera.width ? { width: s.camera.width, height: s.camera.height } : null,
      intrinsics: s.K ? { fx: r1(s.K.fx), fy: r1(s.K.fy), cx: r1(s.K.cx), cy: r1(s.K.cy) } : null,
      flipY: s.flipY === undefined ? null : s.flipY,
      keyframes: s.keyframes || 0,
      landmarks: s.landmarks || 0,
      mapSizeMB: s.mapSizeMB === undefined ? null : s.mapSizeMB,
      buildMs: s.buildMs === undefined ? null : s.buildMs,
      buildStats: s.buildStats || null,
      opencvLoadMs: s.opencvLoadMs === undefined ? null : r1(s.opencvLoadMs),
      localization: {
        attempts: loc.length,
        successes: okN,
        successRate: loc.length ? Math.round(okN / loc.length * 1000) / 1000 : null,
        msStats: statsSummary(loc.map(function (a) { return a.ms; })),
        inliersStats: statsSummary(loc.filter(function (a) { return a.ok; }).map(function (a) { return a.inliers; })),
        translationErrCm: statsSummary(loc.filter(function (a) { return a.ok; }).map(function (a) { return a.transCm; })),
        rotationErrDeg: statsSummary(loc.filter(function (a) { return a.ok; }).map(function (a) { return a.rotDeg; }))
      },
      errors: (s.errors || []).slice(0, 50)
    };
  }

  return {
    DESC: DESC, xrMatrixToPose: xrMatrixToPose, poseToXrMatrix: poseToXrMatrix, poseFromRt: poseFromRt,
    intrinsicsFromProjection: intrinsicsFromProjection, projectionFromIntrinsics: projectionFromIntrinsics,
    project: project, rgbaToGray: rgbaToGray, shouldCaptureKeyframe: shouldCaptureKeyframe,
    epipolarDistance: epipolarDistance, triangulateDLT: triangulateDLT, reprojError: reprojError, parallaxDeg: parallaxDeg,
    matchHamming: matchHamming, hamming: hamming, statsSummary: statsSummary, buildMap: buildMap,
    extractORB: extractORB, solvePnPRansac: solvePnPRansac, localize: localize, poseError: poseError,
    serializeMap: serializeMap, deserializeMap: deserializeMap, buildReport2: buildReport2,
    rodriguesToMatrix: rodriguesToMatrix, matrixToRodrigues: matrixToRodrigues, rotAngleDeg: rotAngleDeg, mulMV: mulMV, mulMM: mulMM, transpose3: transpose3
  };
});
