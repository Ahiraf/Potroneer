import * as THREE from "three";

export function createWorldEffects(world) {
  const root = new THREE.Group();
  const weatherGroup = new THREE.Group();
  const critterGroup = new THREE.Group();
  root.add(weatherGroup, critterGroup);
  world.add(root);
  let weatherType = "clear";
  let weather = null;
  let critters = [];

  function clearGroup(group) {
    while (group.children.length) group.remove(group.children[0]);
  }

  function makeWeather(type) {
    clearGroup(weatherGroup);
    weather = null;
    weatherType = type;
    if (type === "clear" || type === "breeze") return;
    const count = type === "stars" ? 180 : type === "fireflies" ? 36 : 130;
    const positions = new Float32Array(count * 3);
    const seeds = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 3.1;
      positions[i * 3 + 1] = -1.1 + Math.random() * 3.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2.8;
      seeds.push(Math.random() * Math.PI * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const palette = { rain: 0xb9d9ed, snow: 0xf3f6ff, petals: 0xf1b7ca, leaves: 0xb8874d, fireflies: 0xd9ef8b, stars: 0xbfd5ff, mist: 0xdce9df, web: 0xdce7ea, lanterns: 0xffbd69, glow: 0xb9f1d4, sparkle: 0xf0d38a };
    const mat = new THREE.PointsMaterial({ color: palette[type] || 0xffffff, size: type === "stars" ? 0.028 : type === "fireflies" ? 0.055 : 0.04, transparent: true, opacity: type === "mist" ? 0.18 : type === "stars" ? 0.8 : 0.62, depthWrite: false, sizeAttenuation: true });
    weather = new THREE.Points(geo, mat);
    weather.userData = { seeds, count };
    weatherGroup.add(weather);
    if (type === "web") {
      const web = new THREE.Group();
      const lineMat = new THREE.LineBasicMaterial({ color: 0xe7eef0, transparent: true, opacity: 0.34 });
      for (let ring = 1; ring <= 3; ring++) {
        const points = [];
        for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; points.push(new THREE.Vector3(Math.cos(a) * ring * 0.28, 0.85, Math.sin(a) * ring * 0.28)); }
        web.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
      }
      for (let arm = 0; arm < 8; arm++) { const a = (arm / 8) * Math.PI * 2; web.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(Math.cos(a) * 0.9, 0.85, Math.sin(a) * 0.9)]), lineMat)); }
      weatherGroup.add(web);
    }
  }

  function makeCritter(type, index) {
    const group = new THREE.Group();
    const color = { butterflies: 0xe5a9c5, birds: 0x8ea8c6, owls: 0x9a7655, spiders: 0x25272b, fireflies: 0xc9e875, satellites: 0xb6c7d6 }[type] || 0x7fa56b;
    group.add(new THREE.Mesh(new THREE.SphereGeometry(type === "spiders" ? 0.045 : 0.06, 8, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.75, emissive: type === "fireflies" ? color : 0x000000, emissiveIntensity: type === "fireflies" ? 1.3 : 0 })));
    if (type === "butterflies") {
      const wingMat = new THREE.MeshBasicMaterial({ color: index % 2 ? 0x7ca7df : 0xd17aa0, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
      for (const side of [-1, 1]) { const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.09), wingMat); wing.position.x = side * 0.07; wing.rotation.y = side * 0.35; group.add(wing); }
    } else if (type === "spiders") {
      const legMat = new THREE.LineBasicMaterial({ color: 0x1b1d20, transparent: true, opacity: 0.9 });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.14, -0.02, Math.sin(a) * 0.14)]), legMat)); group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-Math.cos(a) * 0.14, -0.02, Math.sin(a) * 0.14)]), legMat)); }
    } else if (type === "satellites") {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.07), new THREE.MeshBasicMaterial({ color: 0x5676a3, side: THREE.DoubleSide })); panel.position.x = 0.13; group.add(panel);
    } else {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xe4e6df, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })); wing.position.y = 0.03; group.add(wing);
    }
    group.userData = { phase: Math.random() * Math.PI * 2, radius: 0.55 + Math.random() * 0.35, height: 0.35 + Math.random() * 1.45, speed: 0.00025 + Math.random() * 0.00022, type };
    group.position.set(0, group.userData.height, 0);
    return group;
  }

  function makeCritters(type) {
    clearGroup(critterGroup); critters = [];
    if (type === "motes") return;
    const count = type === "spiders" || type === "satellites" ? 2 : 3;
    for (let i = 0; i < count; i++) { const critter = makeCritter(type, i); critters.push(critter); critterGroup.add(critter); }
  }

  function update(now) {
    if (weather) {
      const pos = weather.geometry.attributes.position;
      const { seeds, count } = weather.userData;
      for (let i = 0; i < count; i++) {
        let x = pos.getX(i); let y = pos.getY(i); const z = pos.getZ(i);
        if (weatherType === "rain") { y -= 0.018; if (y < -1.1) y = 2.1; }
        else if (["snow", "petals", "leaves"].includes(weatherType)) { y -= weatherType === "snow" ? 0.0025 : 0.004; x += Math.sin(now * 0.001 + seeds[i]) * 0.0016; if (y < -1.1) y = 2.1; }
        else if (["fireflies", "lanterns", "glow"].includes(weatherType)) { x += Math.sin(now * 0.0008 + seeds[i]) * 0.002; y += Math.cos(now * 0.001 + seeds[i]) * 0.0015; }
        else if (["stars", "sparkle"].includes(weatherType)) weather.material.opacity = 0.55 + Math.sin(now * 0.002 + seeds[i]) * 0.35;
        else if (weatherType === "mist") { x += 0.0005; if (x > 1.6) x = -1.6; }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }
    critters.forEach((critter) => { const u = critter.userData; const a = now * u.speed + u.phase; critter.position.set(Math.cos(a) * u.radius, u.height + Math.sin(a * 1.6) * 0.08, Math.sin(a) * u.radius); critter.rotation.y = -a + Math.PI / 2; if (["butterflies", "birds", "owls"].includes(u.type)) critter.children.forEach((child, index) => { if (index > 0) child.rotation.z = Math.sin(now * 0.01 + u.phase) * 0.4 * (index % 2 ? 1 : -1); }); });
  }

  function setTheme(theme) { makeWeather(theme.weather || "clear"); makeCritters(theme.critters || "motes"); }
  makeWeather("clear"); makeCritters("motes");
  return { root, setWeather: makeWeather, setCritters: makeCritters, setTheme, update };
}
