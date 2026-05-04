export function deform(landmarks, settings) {



  if (!landmarks) return null

  const category = settings?.category
  const controls = settings?.getAll?.(category) || {}

  const size = controls.size || 0
  const distance = controls.distance || 0
  const width = controls.width || 0
  const height = controls.height || 0
  const tilt = controls.tilt || 0
  const narrow = controls.narrow || 0
  const lift = controls.lift || 0
  const tip = controls.tip || 0
  const chinValue = controls.chin || 0
  const thick = controls.thick || 0
  const shape = controls.shape || 0
  const smile = controls.smile || 0
  

  

  if (!category) return landmarks

  const output = landmarks.map(p => ({ x: p.x, y: p.y }))

  /* =========================
     EYES
  ========================= */

  if (category === "eyes") {
    const leftEye = [33,133,160,159,158,144,145,153]
    const rightEye = [362,263,387,386,385,373,374,380]

    const faceCenter = getFaceCenter(landmarks)

    applyEyeSize(output, leftEye, size)
    applyEyeSize(output, rightEye, size)

    applyEyeWidth(output, leftEye, width)
    applyEyeWidth(output, rightEye, width)

    applyEyeHeight(output, leftEye, height)
    applyEyeHeight(output, rightEye, height)

    applyEyeTilt(output, leftEye, tilt, "left")
    applyEyeTilt(output, rightEye, tilt, "right")

    applyEyeDistance(output, leftEye, faceCenter, distance)
    applyEyeDistance(output, rightEye, faceCenter, distance)
  }

  /* =========================
     NOSE
  ========================= */

  if (category === "nose") {

    const nose = [
      1,2,5,4,
      168,197,195,
      98,327
    ] 
    const noseTip = [1]
    const noseBridge = [168,197,195]
    const nostrils = [98,327]

    applyNoseSize(output, nose, size)
    applyNoseWidth(output, nostrils, width)
    applyNoseNarrow(output, noseBridge, narrow)
    applyNoseLift(output, noseTip, lift)
    applyNoseTip(output, noseTip, tip)
  }

  /* =========================
     LIPS
  ========================= */

  if (category === "lips") {
    const lips = [
      61,146,91,181,84,17,314,405,321,375,
      291,308,324,318,402,317,14,87
    ]

    applyLipSize(output, lips, size)
    applyLipWidth(output, lips, width)
    applyLipHeight(output, lips, height)
  }

  /* =========================
     JAW
  ========================= */

  if (category === "jaw") {

    const jaw = [
      234,93,132,58,172,136,
      150,149,176,148,152,
      377,400,378,379,365,397
    ]

    const chin = [
      152,148,176,149,150,
      377,400,378,379
    ]

    applyJawWidth(output, jaw, width)
    applyChin(output, chin, chinValue)
  }

  /* =========================
     EYEBROWS (MIRRORED)
  ========================= */

  if (category === "eyebrows") {

    const left = [70,63,105,66,107,55,65,52,53,46,193,189]
    const right = [336,296,334,293,300,285,295,282,283,276,417,413]

    const c = getCenter(output, left)

    const angle = tilt * 0.35
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    for (let i of left) {
      let dx = output[i].x - c.x
      let dy = output[i].y - c.y

      const f = falloff(dx, dy, 0.008) // smoother falloff

      // 1️⃣ thickness (stable base)
      dy = dy * (1 + thick * 0.6 * f)

      // 2️⃣ lif
      const DEBUG_MULTIPLIER = 1
      dy -= lift * 4.5 * f * DEBUG_MULTIPLIER

      // 3️⃣ shape curve (natural arch)
      dy -= dx * dx * shape * 0.0012

      // 4️⃣ rotation (AFTER shape)
      const nx = dx * cos - dy * sin
      const ny = dx * sin + dy * cos

      output[i].x = c.x + nx
      output[i].y = c.y + ny
      // lift
      output[i].y -= lift * 2.0 * f * DEBUG_MULTIPLIER
    }

    // 5️⃣ MIRROR (critical for stability)
    const fc = getFaceCenter(output)

    for (let i = 0; i < left.length; i++) {
      const l = left[i]
      const r = right[i]

      const dx = output[l].x - fc.x

      output[r].x = fc.x - dx
      output[r].y = output[l].y
    }

    // 6️⃣ distance AFTER mirror
    const spacing = distance * 3.5

    for (let i of left) output[i].x -= spacing
    for (let i of right) output[i].x += spacing

   
  }

  if (category === "face") {

    const face = [
      234,93,132,58,172,136,
      150,149,176,148,152,
      377,400,378,379,365,397
    ]

    const mouth = [61,291,0,17]

    applyFaceWidth(output, face, width)
    applySmile(output, mouth, smile)

    
  }

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

  return {
    x: cx / indices.length,
    y: cy / indices.length
  }
}

function getFaceCenter(points) {
  const left = points[33]
  const right = points[263]

  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2
  }
}

/* =========================
   EYES
========================= */

function applyEyeSize(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)
  const scale = 1 + value * 0.25

  for (let i of indices) {
    const dx = points[i].x - c.x
    const dy = points[i].y - c.y
    points[i].x = c.x + dx * scale
    points[i].y = c.y + dy * scale
  }
}

function applyEyeWidth(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)
  const scale = 1 + value * 0.25

  for (let i of indices) {
    const dx = points[i].x - c.x
    points[i].x = c.x + dx * scale
  }
}

function applyEyeHeight(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)
  const scale = 1 + value * 0.35

  for (let i of indices) {
    const dy = points[i].y - c.y
    points[i].y = c.y + dy * scale
  }
}

function applyEyeTilt(points, indices, value, side) {
  if (!value) return

  const c = getCenter(points, indices)
  const dir = side === "left" ? 1 : -1
  const angle = value * 0.5 * dir

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  for (let i of indices) {
    const dx = points[i].x - c.x
    const dy = points[i].y - c.y

    points[i].x = c.x + dx * cos - dy * sin
    points[i].y = c.y + dx * sin + dy * cos
  }
}

function applyEyeDistance(points, indices, faceCenter, value) {
  if (!value) return

  const strength = value * 2.0

  for (let i of indices) {
    points[i].x += (points[i].x < faceCenter.x ? -1 : 1) * strength
  }
}

/* =========================
   NOSE
========================= */

function applyNoseSize(points, indices, value) {
  if (!value) return

  const c = {
    x: points[168].x,
    y: points[168].y
  }

  const baseScale = 1 + value * 0.03

  for (let i of indices) {
    const dx = points[i].x - c.x
    const dy = points[i].y - c.y

    const f = falloff(dx, dy, 0.01)

    const scale = 1 + (baseScale - 1) * f

    points[i].x = c.x + dx * scale
    points[i].y = c.y + dy * scale
  }
}

function applyNoseWidth(points, indices, value) {
  if (!value) return

  const c = {
    x: points[168].x,
    y: points[168].y
  }

  for (let i of indices) {
    const dx = points[i].x - c.x

    const influence = Math.max(
      0,
      1 - Math.abs(dx) / 35
    )
    const localScale = 1 + value * 0.08 * influence

    points[i].x = c.x + dx * localScale
  }
}

function applyNoseNarrow(points, indices, value) {
  if (!value) return

  const c = {
    x: points[168].x,
    y: points[168].y
  }

  const scale = 1 - value * 0.12
  const maxShift = 6

  for (let i of indices) {

    let dx = points[i].x - c.x

    dx = Math.max(
      -maxShift,
      Math.min(maxShift, dx)
    )

    points[i].x = c.x + dx * scale
  }
}

function applyNoseLift(points, indices, value) {
  if (!value) return
  for (let i of indices) points[i].y -= value * 0.8
}

function applyNoseTip(points, indices, value) {
  if (!value) return
  for (let i of indices) points[i].y -= value * 0.8
}

/* =========================
   LIPS
========================= */

function applyLipSize(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dx = points[i].x - c.x
    const dy = points[i].y - c.y

    const f = falloff(dx, dy, 0.04)

    points[i].x = c.x + dx * (1 + value * 0.35 * f)
    points[i].y = c.y + dy * (1 + value * 0.45 * f)
  }
}

function applyLipWidth(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dx = points[i].x - c.x
    const f = falloff(dx, 0, 0.02)

    points[i].x = c.x + dx * (1 + value * 0.08 * f)
  }
}

function applyLipHeight(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dy = points[i].y - c.y
    const f = falloff(0, dy, 0.02)

    points[i].y = c.y + dy * (1 + value * 0.25 * f)
  }
}
/* =========================
   JAW
========================= */

function applyJawWidth(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dx = points[i].x - c.x
    const dy = points[i].y - c.y

    const f = falloff(dx, dy, 0.01)

    points[i].x += dx * value * 0.03 * f
  }
}

function applyChin(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dx = points[i].x - c.x
    const dy = points[i].y - c.y

    if (dy <= 0) continue

    const f = falloff(dx, dy, 0.3)

    points[i].y += value * 10 * f
  }
}

/* =========================
   EYEBROWS
========================= */

function applyBrowThickness(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)
  const scale = 1 + value * 0.8

  for (let i of indices) {
    const dy = points[i].y - c.y
    points[i].y = c.y + dy * scale
  }
}

function applyBrowLift(points, indices, value) {
  if (!value) return
  for (let i of indices) points[i].y -= value * 6.0
}

function applyBrowTilt(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)
  const angle = value * 0.6

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  for (let i of indices) {
    const dx = points[i].x - c.x
    const dy = points[i].y - c.y

    points[i].x = c.x + dx * cos - dy * sin
    points[i].y = c.y + dx * sin + dy * cos
  }
}

function applyBrowShape(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dx = points[i].x - c.x
    points[i].y -= dx * dx * value * 0.002
  }
}

function applyBrowDistance(points, left, right, value) {
  if (!value) return

  const strength = value * 2.0

  for (let i of left) points[i].x -= strength
  for (let i of right) points[i].x += strength
}



function applyFaceWidth(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dx = points[i].x - c.x

    const influence = Math.min(
      1,
      Math.abs(dx) * 0.004
    )

    const strength = value * 0.12 * influence
    points[i].x += dx * strength
  }
}

function applySmile(points, indices, value) {
  if (!value) return

  const left = points[61]
  const right = points[291]

  const strength = value * 3.0

  // corners go up
  left.y -= strength
  right.y -= strength

  // center stays more stable
  const mid = points[0]
  mid.y -= strength * 0.3
}