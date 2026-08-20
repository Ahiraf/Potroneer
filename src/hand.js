import * as THREE from "three";

// ---------------------------------------------------------------------------
// The builder's hand
// ---------------------------------------------------------------------------
// Real terrarium building is a pair of tweezers pinched between finger and
// thumb, lowered slowly into the glass. That gesture — reach, hover, dip,
// release, lift — is what this module puts on screen. The hand lives in *scene*
// space rather than the spinning `world`, so it always comes in over the
// player's right shoulder no matter how far the jar has been turned.
//
// Everything is modelled in a simple upright frame (tweezer tips at the origin,
// shafts running up +Y) and then tipped over by one quaternion, so the pose can
// be re-aimed by changing APPROACH alone.

// Matched to the reference clip: the tweezers come almost straight down from
// the top of frame, tipped just enough to read as held rather than mounted, and
// the hand rides high up the shafts so only fingers and a cuff stay in shot.
const APPROACH = new THREE.Vector3(0.26, 1, 0.2).normalize();
const SHAFT = 2.45;

const SKIN = 0xe9b391;

function skinMat(color = SKIN) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0 });
}

// A finger: three shortening segments hinged into a curl, so it wraps the shaft
// instead of reading as one stiff sausage.
function buildFinger(len, curl, mat) {
  const g = new THREE.Group();
  let parent = g;
  const segs = [0.42, 0.33, 0.25];
  segs.forEach((f, i) => {
    const h = len * f;
    const r = 0.052 - i * 0.008;
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 4, 10), mat);
    seg.position.y = h / 2 + (i === 0 ? 0 : 0.01);
    const joint = new THREE.Group();
    joint.rotation.x = i === 0 ? curl * 0.7 : curl;
    joint.add(seg);
    const next = new THREE.Group();
    next.position.y = h + 0.01;
    seg.add(next);
    parent.add(joint);
    parent = next;
  });
  return g;
}

function buildHandMesh() {
  // Frame: +Y runs up the tweezer shafts toward the top of the screen, +Z is
  // toward the camera. So the palm sits *behind* the shafts, the fingers curl
  // forward and under them, and the wrist leaves upward, out of shot.
  const g = new THREE.Group();
  const mat = skinMat();

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.26), mat);
  palm.position.set(0.03, 0.1, -0.24);
  palm.rotation.x = -0.12;
  g.add(palm);

  // knuckle roll along the front of the palm, where the fingers hinge off
  const knuckles = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.34, 5, 12), mat);
  knuckles.rotation.z = Math.PI / 2;
  knuckles.position.set(0.03, -0.03, -0.16);
  g.add(knuckles);

  // Four fingers hinged forward off the knuckles and curled under the shafts —
  // index highest and least curled, little finger lowest and tightest, which is
  // what makes a pinch grip read as a grip.
  const fingers = [
    { x: -0.15, y: 0.02, len: 0.46, curl: 0.72, pitch: -1.15 },
    { x: -0.02, y: -0.03, len: 0.48, curl: 0.8, pitch: -1.3 },
    { x: 0.12, y: -0.08, len: 0.44, curl: 0.86, pitch: -1.45 },
    { x: 0.24, y: -0.14, len: 0.38, curl: 0.9, pitch: -1.6 },
  ];
  fingers.forEach((f) => {
    const finger = buildFinger(f.len, f.curl, mat);
    finger.position.set(f.x, f.y, -0.14);
    finger.rotation.set(f.pitch, 0, -f.x * 0.35);
    g.add(finger);
  });

  // Thumb coming across the front of the shafts — the other half of the pinch,
  // and the part closest to camera, so it does most of the storytelling.
  const thumb = buildFinger(0.44, 0.5, mat);
  thumb.position.set(-0.2, 0.14, -0.1);
  thumb.rotation.set(-0.95, 0.25, 0.9);
  g.add(thumb);

  // Wrist and cuff continue up and back, running off the top of the frame so
  // the hand never reads as a severed prop.
  const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.44, 5, 14), mat);
  wrist.position.set(0.03, 0.52, -0.32);
  wrist.rotation.x = -0.24;
  g.add(wrist);

  // Long enough that the sleeve always runs off the top of the frame instead of
  // ending in a floating stub over the jar.
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.2, 3.4, 18, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x9fb3a4,
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
  );
  cuff.position.set(0.03, 2.35, -0.74);
  cuff.rotation.x = -0.24;
  g.add(cuff);
  return g;
}

export function createHand() {
  const group = new THREE.Group();
  group.name = "builderHand";
  group.visible = false;

  // `tool` holds the whole upright model; `group` only carries it to the target
  // point and tips it into the approach angle.
  const tool = new THREE.Group();
  tool.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), APPROACH);
  group.add(tool);

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xd8dde2,
    roughness: 0.28,
    metalness: 0.85,
  });

  // Tweezers: two tapered prongs meeting at the origin and splayed apart where
  // the fingers pinch them. `prongs[i].userData.side` drives the open/close.
  const prongs = [-1, 1].map((side) => {
    const prong = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.007, SHAFT, 10),
      steelMat,
    );
    prong.geometry.translate(0, SHAFT / 2, 0);
    prong.userData.side = side;
    tool.add(prong);
    // the milled grip rings the real tool has where the fingers sit
    for (let i = 0; i < 7; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, 5, 12), steelMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = SHAFT * (0.7 + i * 0.035);
      prong.add(rib);
    }
    return prong;
  });
  // the bend at the top where the two halves are joined
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 8, 14, Math.PI), steelMat);
  yoke.position.y = SHAFT;
  yoke.rotation.y = Math.PI / 2;
  tool.add(yoke);

  const hand = buildHandMesh();
  hand.position.set(0.0, SHAFT * 0.8, 0.03);
  hand.rotation.set(0.06, 0.2, -0.06);
  hand.scale.setScalar(0.76);
  tool.add(hand);

  // The ingredient being carried rides between the prong tips until it's let go.
  const carried = new THREE.Group();
  carried.position.y = 0.06;
  tool.add(carried);

  // --- animation state ---------------------------------------------------
  const target = new THREE.Vector3(); // where the tips want to be
  const pos = new THREE.Vector3(); // where they are
  let alive = false; // hand wanted on screen
  let opened = 0; // 0 = pinched, 1 = released
  let openT = 0;
  let dip = 0; // extra downward reach during a place
  let dipT = 0;
  let placing = null; // { t, drop }
  let fade = 0; // 0..1 scale-in
  let idleUntil = 0;

  function clearCarried() {
    carried.clear();
  }

  /** Show the hand and steer the tweezer tips toward a world point. */
  function hoverTo(point, now = performance.now()) {
    target.copy(point);
    if (!alive) {
      alive = true;
      group.visible = true;
      pos.copy(point).addScaledVector(APPROACH, 1.4); // fly in from above
    }
    idleUntil = now + 2600;
  }

  /** Carry a small stand-in of the item that is about to be planted. */
  function carry(object) {
    clearCarried();
    if (!object) return;
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    carried.add(object);
  }

  /** Dip to `point`, release whatever is pinched, then lift away. */
  function placeAt(point, drop, now = performance.now()) {
    hoverTo(point, now);
    placing = { t: 0, drop, done: false };
    idleUntil = now + 2200;
  }

  function hide() {
    alive = false;
  }

  function update(now, dt) {
    if (!group.visible) return;
    if (alive && now > idleUntil) alive = false;

    // ease the tips toward the target, with a small breathing drift so the
    // hand never looks pinned to a rail
    const k = 1 - Math.pow(0.001, dt / 1000);
    pos.lerp(target, Math.min(1, k * 1.6));
    const bob = Math.sin(now * 0.0022) * 0.012;
    const swayX = Math.sin(now * 0.0013) * 0.008;

    if (placing) {
      placing.t = Math.min(1, placing.t + dt / 620);
      const p = placing.t;
      // reach down, hold, open, lift
      dipT = p < 0.42 ? Math.sin((p / 0.42) * Math.PI * 0.5) : Math.max(0, 1 - (p - 0.42) / 0.58);
      openT = p > 0.36 ? Math.min(1, (p - 0.36) / 0.18) : 0;
      if (!placing.done && p >= 0.42) {
        placing.done = true;
        clearCarried();
        placing.drop?.();
      }
      if (p >= 1) {
        placing = null;
        openT = 0;
        dipT = 0;
      }
    }

    dip += (dipT - dip) * Math.min(1, dt / 90);
    opened += (openT - opened) * Math.min(1, dt / 70);

    group.position.set(
      pos.x + swayX,
      pos.y + bob + 0.22 - dip * 0.22,
      pos.z,
    );

    prongs.forEach((prong) => {
      const s = prong.userData.side;
      prong.position.x = s * (0.012 + opened * 0.055);
      prong.rotation.z = -s * (0.012 + opened * 0.05);
    });
    carried.scale.setScalar(1 - opened);

    // fade/scale in and out instead of popping
    const want = alive ? 1 : 0;
    fade += (want - fade) * Math.min(1, dt / 160);
    if (fade < 0.01 && !alive) {
      group.visible = false;
      clearCarried();
      fade = 0;
      return;
    }
    const s = 0.25 + fade * 0.75;
    tool.scale.setScalar(s);
    tool.position.copy(APPROACH).multiplyScalar((1 - fade) * 0.9);
  }

  return { group, hoverTo, placeAt, carry, hide, update };
}
