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

    const nose = [1,2,98,327,168,197,195,5,4,45,275]
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

    const leftBrow = [
      70,63,105,66,107,
      55,65,52,53,46,
      193,189
    ]

    const rightBrow = [
      336,296,334,293,300,
      285,295,282,283,276,
      417,413
    ]

    // deform LEFT only
    applyBrowLift(output, leftBrow, lift)
    applyBrowTilt(output, leftBrow, tilt)
    applyBrowShape(output, leftBrow, shape)
    applyBrowThickness(output, leftBrow, thick)

    // mirror to right
    mirrorBrow(output, leftBrow, rightBrow)

    // then distance
    applyBrowDistance(output, leftBrow, rightBrow, distance)
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

  const c = getCenter(points, indices)
  const scale = 1 + value * 0.25

  for (let i of indices) {
    const dx = points[i].x - c.x
    const dy = points[i].y - c.y
    points[i].x = c.x + dx * scale
    points[i].y = c.y + dy * scale
  }
}

function applyNoseWidth(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)
  const scale = 1 + value * 0.5

  for (let i of indices) {
    const dx = points[i].x - c.x
    points[i].x = c.x + dx * scale
  }
}

function applyNoseNarrow(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)
  const scale = 1 - value * 0.3

  for (let i of indices) {
    const dx = points[i].x - c.x
    points[i].x = c.x + dx * scale
  }
}

function applyNoseLift(points, indices, value) {
  if (!value) return
  for (let i of indices) points[i].y -= value * 2.0
}

function applyNoseTip(points, indices, value) {
  if (!value) return
  for (let i of indices) points[i].y -= value * 2.0
}

/* =========================
   LIPS
========================= */

function applyLipSize(points, indices, value) {
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

function applyLipWidth(points, indices, value) {
  if (!value) return
  const c = getCenter(points, indices)
  const scale = 1 + value * 0.3

  for (let i of indices) {
    const dx = points[i].x - c.x
    points[i].x = c.x + dx * scale
  }
}

function applyLipHeight(points, indices, value) {
  if (!value) return
  const c = getCenter(points, indices)
  const scale = 1 + value * 0.3

  for (let i of indices) {
    const dy = points[i].y - c.y
    points[i].y = c.y + dy * scale
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
    const influence = Math.min(1, Math.abs(dx) * 0.02)
    const strength = value * 0.15 * influence
    points[i].x += dx * strength
  }
}

function applyChin(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dy = points[i].y - c.y
    if (dy <= 0) continue

    const influence = Math.min(1, dy * 0.03)
    const strength = value * 8.0 * influence
    points[i].y += strength
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

function mirrorBrow(points, left, right) {
  const leftEye = points[33].x
  const rightEye = points[263].x

  for (let i = 0; i < left.length; i++) {
    const l = left[i]
    const r = right[i]

    const t = (points[l].x - leftEye) / (rightEye - leftEye)

    points[r].x = rightEye - t * (rightEye - leftEye)
    points[r].y = points[l].y
  }
}

function applyFaceWidth(points, indices, value) {
  if (!value) return

  const c = getCenter(points, indices)

  for (let i of indices) {
    const dx = points[i].x - c.x

    const influence = Math.abs(dx) * 0.02
    const strength = value * 0.25 * influence

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