import * as THREE from "three";

// Weather only. There used to be two or three "critters" — birds, owls,
// butterflies — orbiting the jar on a fixed circle in every world. They read as
// pale spheres drifting across the backdrop rather than as wildlife, and having
// the same three objects circle every single theme made all of them feel alike,
// so they were removed rather than reworked.
export function createWorldEffects(world) {
  const root = new THREE.Group();
  const weatherGroup = new THREE.Group();
  root.add(weatherGroup);
  world.add(root);
  let weatherType = "clear";
  let weather = null;

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
  }

  function setTheme(theme) { makeWeather(theme.weather || "clear"); }
  makeWeather("clear");
  return { root, setWeather: makeWeather, setTheme, update };
}
