/**
 * deform(landmarks, state)
 *
 * Single-pass deformation: ALL categories are applied in ONE call.
 * Each category reads from the ORIGINAL landmarks and writes to output.
 * No category ever reads another category's output — no cumulative drift.
 */
export function deform(landmarks, state) {
  if (!landmarks) return null

  // Clone original once — every category reads from `landmarks`, writes to `output`
  const output = landmarks.map(p => ({ x: p.x, y: p.y }))

  applyEyes(landmarks, output, state.getAll("eyes"))
  applyNose(landmarks, output, state.getAll("nose"))
  applyLips(landmarks, output, state.getAll("lips"))
  applyJaw(landmarks, output, state.getAll("jaw"))
  applyEyebrows(landmarks, output, state.getAll("eyebrows"))
  applyFace(landmarks, output, state.getAll("face"))

  return output
}

/* =========================
   HELPERS
========================= */

function falloff(dx, dy, k = 0.015) {
  const d = Math.sqrt(dx * dx + dy * dy)
  return Math.exp(-d * k)
}

function getCenter(points, indices) {
  let cx = 0, cy = 0
  for (let i of indices) {
    cx += points[i].x
    cy += points[i].y
  }
  return { x: cx / indices.length, y: cy / indices.length }
}

function getFaceCenter(points) {
  return {
    x: (points[33].x + points[263].x) / 2,
    y: (points[33].y + points[263].y) / 2
  }
}

/* =========================
   EYES
========================= */

function applyEyes(src, out, c) {
  const size     = c.size     || 0
  const width    = c.width    || 0
  const height   = c.height   || 0
  const tilt     = c.tilt     || 0
  const distance = c.distance || 0

  if (!size && !width && !height && !tilt && !distance) return

  const leftEye  = [33, 133, 160, 159, 158, 144, 145, 153]
  const rightEye = [362, 263, 387, 386, 385, 373, 374, 380]
  const faceCenter = getFaceCenter(src)

  eyeTransform(src, out, leftEye,  size, width, height, tilt, distance, faceCenter, "left")
  eyeTransform(src, out, rightEye, size, width, height, tilt, distance, faceCenter, "right")
}

function eyeTransform(src, out, indices, size, width, height, tilt, distance, faceCenter, side) {
  const c = getCenter(src, indices)

  const sizeScale   = 1 + size * 0.45
  const widthScale  = 1 + width * 0.45
  const heightScale = 1 + height * 0.35
  const dir         = side === "left" ? 1 : -1
  const angle       = tilt * 0.5 * dir
  const cos         = Math.cos(angle)
  const sin         = Math.sin(angle)
  const distShift   = distance * 2.5

  for (let i of indices) {
    let dx = src[i].x - c.x
    let dy = src[i].y - c.y

    // size
    dx *= sizeScale
    dy *= sizeScale

    // width
    dx *= widthScale

    // height
    dy *= heightScale

    // tilt (rotation around eye center)
    const rx = dx * cos - dy * sin
    const ry = dx * sin + dy * cos
    dx = rx
    dy = ry

    out[i].x = c.x + dx + (src[i].x < faceCenter.x ? -1 : 1) * distShift
    out[i].y = c.y + dy
  }
}

/* =========================
   NOSE — production-quality, Facetune-style
   All operations read from `src` (original landmarks) to prevent
   compound distortion when multiple controls are active simultaneously.
========================= */

function applyNose(src, out, c) {
  const size   = c.size   || 0
  const width  = c.width  || 0
  const narrow = c.narrow || 0
  const lift   = c.lift   || 0
  const tip    = c.tip    || 0

  if (!size && !width && !narrow && !lift && !tip) return

  // ── Anatomical reference points ───────────────────────────────────────────
  // All verified MediaPipe 468-point mesh indices
  const noseAll    = [1, 2, 5, 4, 19, 94, 45, 275, 98, 327, 168, 197, 195, 6]
  const noseTip    = [1, 2, 5, 4, 19, 94]          // very tip of nose
  const nostrils   = [98, 327, 45, 275, 2, 5]       // nostril wings
  // Bridge side landmarks — verified to exist in MediaPipe 468-point mesh
  // and have actual horizontal offset from center axis
  const bridgeSide = [193, 417, 122, 351]

  // Structural measurements from original landmarks
  const bridgeY = src[168].y                         // top of nose bridge
  const tipY    = src[1].y                           // nose tip
  const noseH   = Math.abs(tipY - bridgeY) || 1     // nose height in pixels
  const noseCx  = (src[98].x + src[327].x) / 2     // horizontal center axis

  // ── SIZE ──────────────────────────────────────────────────────────────────
  // Uniform radial scale from bridge root + proportional nostril spread.
  // Reads from src throughout — no compound distortion.
  if (size) {
    const anchor = { x: noseCx, y: bridgeY }
    const scale  = 1 + size * 0.32

    for (let i of noseAll) {
      const dx = src[i].x - anchor.x
      const dy = src[i].y - anchor.y
      out[i].x = anchor.x + dx * scale
      out[i].y = anchor.y + dy * scale
    }

    // Extra nostril spread — nostrils widen more than bridge (anatomically correct)
    for (let i of nostrils) {
      const t  = Math.max(0, Math.min(1, (src[i].y - bridgeY) / noseH))
      const dx = src[i].x - noseCx
      // Apply on top of size-scaled position
      out[i].x = noseCx + dx * scale * (1 + size * 0.15 * t)
    }
  }

  // ── WIDTH (nostrils) ──────────────────────────────────────────────────────
  // Push nostril wings outward/inward from center axis.
  // Always reads from src — independent of size control.
  // width > 0 = wider, width < 0 = narrower.
  if (width) {
    const cx = noseCx
    for (let i of nostrils) {
      const dx = src[i].x - cx
      out[i].x = cx + dx * (1 + width * 0.90)
    }
  }

  // ── NARROW (bridge) ───────────────────────────────────────────────────────
  // Compress/widen the nose bridge using side-of-nose landmarks.
  // Always reads from src — independent of width control.
  // narrow > 0 = narrower bridge, narrow < 0 = wider bridge.
  if (narrow) {
    const cx = noseCx
    for (let i of bridgeSide) {
      if (!src[i]) continue
      const dx = src[i].x - cx
      out[i].x = cx + dx * (1 - narrow * 0.70)
    }
    // Also compress the center bridge points slightly
    for (let i of [168, 197, 195, 6]) {
      const dx = src[i].x - cx
      out[i].x = cx + dx * (1 - narrow * 0.25)
    }
  }

  // ── LIFT ──────────────────────────────────────────────────────────────────
  // Move the entire nose tip region up or down uniformly.
  // lift > 0 = tip moves up, lift < 0 = tip moves down.
  // Flat shift applied to all tip points equally.
  if (lift) {
    const shift = lift * 8.0
    for (let i of noseTip) {
      out[i].y = src[i].y - shift
    }
  }

  // ── TIP ───────────────────────────────────────────────────────────────────
  // Tilt the very tip of the nose up or down around a pivot.
  // tip > 0 (right slider) = tip moves UP (upturned/refined)
  // tip < 0 (left slider)  = tip moves DOWN (drooping)
  if (tip) {
    const pivotY = bridgeY + noseH * 0.6
    for (let i of [1, 2, 4, 5]) {
      const dy = src[i].y - pivotY
      if (dy > 0) {
        out[i].y = src[i].y - tip * 3.5 * (dy / (noseH * 0.4))
      }
    }
  }
}

/* =========================
   LIPS  (single-pass, tight local)
========================= */

function applyLips(src, out, c) {
  const size   = c.size   || 0
  const width  = c.width  || 0
  const height = c.height || 0

  if (!size && !width && !height) return

  const indices = [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
    308, 324, 318, 402, 317, 14, 87
  ]

  const center = getCenter(src, indices)

  // Compute bounding extents
  let maxDist = 0, maxDx = 0, maxDy = 0
  for (let i of indices) {
    const dx = src[i].x - center.x
    const dy = src[i].y - center.y
    const d  = Math.sqrt(dx * dx + dy * dy)
    if (d  > maxDist) maxDist = d
    if (Math.abs(dx) > maxDx) maxDx = Math.abs(dx)
    if (Math.abs(dy) > maxDy) maxDy = Math.abs(dy)
  }
  if (maxDist < 1) return

  for (let i of indices) {
    const dx = src[i].x - center.x
    const dy = src[i].y - center.y
    const d  = Math.sqrt(dx * dx + dy * dy)

    // Hard falloff — only lip points themselves
    const f = Math.max(0, 1 - d / (maxDist * 1.05))

    let nx = dx
    let ny = dy

    // SIZE
    if (size) {
      nx = dx * (1 + size * 0.28 * f)
      ny = dy * (1 + size * 0.32 * f)
    }

    // WIDTH (outer corners get more)
    if (width && maxDx > 0) {
      const fw = Math.abs(dx) / maxDx
      nx = nx * (1 + width * 0.20 * fw)
    }

    // HEIGHT (top/bottom edges get more)
    if (height && maxDy > 0) {
      const fh = Math.abs(dy) / maxDy
      ny = ny * (1 + height * 0.33 * fh)
    }

    out[i].x = center.x + nx
    out[i].y = center.y + ny
  }
}

/* =========================
   JAW
========================= */

function applyJaw(src, out, c) {
  const width    = c.width || 0
  const chinVal  = c.chin  || 0

  if (!width && !chinVal) return

  const jawIndices = [
    234, 93, 132, 58, 172, 136,
    150, 149, 176, 148, 152,
    377, 400, 378, 379, 365, 397
  ]

  const chinIndices = [
    152, 148, 176, 149, 150,
    377, 400, 378, 379
  ]

  if (width) {
    const cj = getCenter(src, jawIndices)
    for (let i of jawIndices) {
      const dx = src[i].x - cj.x
      const dy = src[i].y - cj.y
      const f  = falloff(dx, dy, 0.01)
      out[i].x = src[i].x + dx * width * 0.03 * f
    }
  }

  if (chinVal) {
    const cc = getCenter(src, chinIndices)
    for (let i of chinIndices) {
      const dx = src[i].x - cc.x
      const dy = src[i].y - cc.y
      if (dy <= 0) continue
      const f = falloff(dx, dy, 0.3)
      out[i].y = src[i].y + chinVal * 10 * f
    }
  }
}

/* =========================
   EYEBROWS
========================= */

function applyEyebrows(src, out, c) {
  const thick    = c.thick    || 0
  const lift     = c.lift     || 0
  const shape    = c.shape    || 0
  const tilt     = c.tilt     || 0
  const distance = c.distance || 0

  if (!thick && !lift && !shape && !tilt && !distance) return

  const left  = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 193, 189]
  const right = [336, 296, 334, 293, 300, 285, 295, 282, 283, 276, 417, 413]

  const cL  = getCenter(src, left)
  const cR  = getCenter(src, right)
  const fc  = getFaceCenter(src)

  // Tilt angle — mirrored for right brow
  const angle    = tilt * 0.35
  const cosA     = Math.cos(angle)
  const sinA     = Math.sin(angle)
  const cosAR    = Math.cos(-angle)   // mirror tilt direction for right brow
  const sinAR    = Math.sin(-angle)

  // ---- LEFT brow — transform directly from src ----
  for (let i of left) {
    let dx = src[i].x - cL.x
    let dy = src[i].y - cL.y

    const f = falloff(dx, dy, 0.012)

    // thickness
    dy = dy * (1 + thick * 0.6 * f)

    // lift
    dy -= lift * 4.5 * f

    // shape curve (arch)
    dy -= dx * dx * shape * 0.0012

    // tilt rotation
    const nx = dx * cosA - dy * sinA
    const ny = dx * sinA + dy * cosA

    out[i].x = cL.x + nx
    out[i].y = cL.y + ny - lift * 2.0 * f
  }

  // ---- RIGHT brow — transform directly from src (NOT from out) ----
  // Mirror the same transforms: flip dx sign for shape/tilt symmetry
  for (let i of right) {
    let dx = src[i].x - cR.x
    let dy = src[i].y - cR.y

    const f = falloff(dx, dy, 0.012)

    // thickness
    dy = dy * (1 + thick * 0.6 * f)

    // lift (same direction as left)
    dy -= lift * 4.5 * f

    // shape curve — flip dx for right brow symmetry
    dy -= (-dx) * (-dx) * shape * 0.0012

    // tilt rotation — mirrored angle
    const nx = dx * cosAR - dy * sinAR
    const ny = dx * sinAR + dy * cosAR

    out[i].x = cR.x + nx
    out[i].y = cR.y + ny - lift * 2.0 * f
  }

  // ---- distance spacing ----
  if (distance) {
    const spacing = distance * 3.5
    for (let i of left)  out[i].x -= spacing
    for (let i of right) out[i].x += spacing
  }
}

/* =========================
   FACE
========================= */

function applyFace(src, out, c) {
  const width = c.width || 0
  const smile = c.smile || 0

  if (!width && !smile) return

  const faceIndices = [
    234, 93, 132, 58, 172, 136,
    150, 149, 176, 148, 152,
    377, 400, 378, 379, 365, 397
  ]

  if (width) {
    const cf = getCenter(src, faceIndices)
    for (let i of faceIndices) {
      const dx = src[i].x - cf.x
      const influence = Math.min(1, Math.abs(dx) * 0.004)
      out[i].x = src[i].x + dx * width * 0.08 * influence
    }
  }

  if (smile) {
    const strength = smile * 20.0
    out[61].y = src[61].y - strength
    out[291].y = src[291].y - strength
    out[0].y  = src[0].y  - strength * 0.3
  }
}
