import * as THREE from "three";

/** Decorative, click-through landing canvas. All coordinates are viewport-relative. */
export function mountLandingScene(host: HTMLElement): () => void {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return () => undefined;
  }

  renderer.setClearColor(0x07080b, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;pointer-events:none";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  const camera = new THREE.OrthographicCamera(-3, 3, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 25);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6f726c,
    roughness: 1,
    metalness: 0,
  });

  // Loose placements; y measures down from the top. No cube reaches the copy zone.
  const slots: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.075, 0.135, -0.2, 0.108], // clipped top-left
    [0.30, 0.095, 0.1, 0.112],  // second top-left
    [0.55, 0.145, -0.3, 0.102], // top-center
    [0.865, 0.105, 0.15, 0.115], // top-right, marked
    [0.395, 0.295, 0.08, 0.116], // loose middle stack
    [0.565, 0.395, -0.2, 0.104],
    [0.18, 0.475, -0.1, 0.108],
    [0.82, 0.34, 0.05, 0.104], // mid-right
    [0.94, 0.525, -0.12, 0.094], // lower-right, partly clipped
  ];
  const cubes = slots.map(([x, y, z, size], index) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { x, y, z, size, index };
    group.add(mesh);
    return mesh;
  });

  const dashGeometry = new THREE.PlaneGeometry(0.026, 0.13);
  const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xe7e3cf, side: THREE.DoubleSide });
  const dash = new THREE.Mesh(dashGeometry, dashMaterial);
  dash.position.set(-0.055, 0.13, 0.501);
  dash.rotation.z = 0.32;
  cubes[3].add(dash);

  scene.add(new THREE.AmbientLight(0xffffff, 0.46));
  const light = new THREE.DirectionalLight(0xffffff, 0.7);
  light.position.set(-3, 5, 8);
  scene.add(light);

  const gridGeometry = new THREE.BufferGeometry();
  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x24302f,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
  scene.add(grid);

  const worldHeight = 10;
  let worldWidth = 5;
  let frame = 0;
  let tiltX = 0;
  let tiltY = 0;

  const render = (moving: boolean, time = 0) => {
    group.rotation.y = moving ? Math.sin(time * 0.00015) * 0.055 + tiltX : 0.02;
    group.rotation.x = moving ? tiltY : 0;
    for (const cube of cubes) {
      const { x, y, z, index } = cube.userData as {
        x: number;
        y: number;
        z: number;
        index: number;
      };
      const driftX = moving ? Math.sin(time * (0.00026 + index * 0.000008) + index * 1.3) * 0.024 : 0;
      const driftY = moving ? Math.sin(time * (0.00032 + index * 0.000012) + index * 1.9) * 0.032 : 0;
      cube.position.set((x - 0.5) * worldWidth + driftX, (0.5 - y) * worldHeight + driftY, z);
    }
    renderer.render(scene, camera);
  };

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    worldWidth = worldHeight * width / height;
    camera.left = -worldWidth / 2;
    camera.right = worldWidth / 2;
    camera.top = worldHeight / 2;
    camera.bottom = -worldHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);

    // Cube size is height-based with a width ceiling: never wall-sized on phones.
    for (const cube of cubes) {
      const { size } = cube.userData as { size: number };
      cube.scale.setScalar(Math.min(size * worldHeight, worldWidth * 0.19));
    }

    // The perspective grid begins at 80% viewport height and fades into black.
    const horizon = -0.3 * worldHeight;
    const bottom = -0.5 * worldHeight;
    const lines: number[] = [];
    for (let i = -5; i <= 5; i++) {
      const x = (i / 5) * worldWidth;
      lines.push(x, bottom, -5, x * 0.12, horizon, -5);
    }
    for (const t of [0.24, 0.46, 0.7, 1]) {
      const y = horizon + (bottom - horizon) * t * t;
      const half = worldWidth * (0.1 + 0.9 * t) / 2;
      lines.push(-half, y, -5, half, y, -5);
    }
    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    gridGeometry.computeBoundingSphere();
    render(!motionQuery.matches);
  };

  const onPointerMove = (event: PointerEvent) => {
    tiltX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 0.05;
    tiltY = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 0.04;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const tick = (time: number) => {
    render(true, time);
    frame = requestAnimationFrame(tick);
  };
  const syncMotion = () => {
    cancelAnimationFrame(frame);
    if (motionQuery.matches) render(false);
    else frame = requestAnimationFrame(tick);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  syncMotion();
  motionQuery.addEventListener("change", syncMotion);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    motionQuery.removeEventListener("change", syncMotion);
    window.removeEventListener("pointermove", onPointerMove);
    geometry.dispose();
    material.dispose();
    dashGeometry.dispose();
    dashMaterial.dispose();
    gridGeometry.dispose();
    gridMaterial.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
