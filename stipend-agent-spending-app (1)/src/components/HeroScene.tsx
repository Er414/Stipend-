"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const FIELD = 0x071014;
const PAPER = 0xf4efe6;
const SIGNAL = 0xe7ff3d;

const CUBE_SLOTS: [number, number, number][] = [
  [0.08, 0.12, 0.06],
  [1.18, 0.28, -0.42],
  [-1.12, -0.18, 0.38],
  [0.46, 1.02, 0.52],
  [-0.58, 0.86, -0.74],
  [0.92, -0.76, 0.48],
  [-0.96, -0.9, -0.22],
  [0.18, -0.38, -1.05],
  [1.32, 0.62, 0.66],
  [-0.22, 1.18, -0.12],
];

type CubeBody = {
  mesh: THREE.Mesh;
  rest: THREE.Vector3;
  fx: number;
  fy: number;
  fz: number;
  px: number;
  py: number;
  pz: number;
  ax: number;
  ay: number;
  az: number;
};

function makeCircuitTraces(): THREE.LineSegments {
  const points: number[] = [];
  const traces: [number, number][][] = [
    [
      [-9.2, -3.4],
      [-4.1, -3.4],
      [-4.1, 1.8],
      [1.6, 1.8],
      [1.6, 4.7],
    ],
    [
      [7.4, -5.8],
      [7.4, -0.6],
      [2.8, -0.6],
      [2.8, 3.1],
      [-1.2, 3.1],
    ],
    [
      [-6.6, 5.2],
      [-1.8, 5.2],
      [-1.8, 0.4],
      [3.9, 0.4],
    ],
    [
      [5.6, 6.0],
      [5.6, 2.2],
      [8.4, 2.2],
    ],
    [
      [-8.0, 0.8],
      [-5.4, 0.8],
      [-5.4, -2.6],
      [-2.0, -2.6],
    ],
  ];

  for (const trace of traces) {
    for (let i = 0; i < trace.length - 1; i += 1) {
      const [x1, z1] = trace[i];
      const [x2, z2] = trace[i + 1];
      points.push(x1, 0, z1, x2, 0, z2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x1e4a52,
    transparent: true,
    opacity: 0.38,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.position.y = -1.82;
  return lines;
}

function makeBeam(): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(2.8, 11, 32, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color: 0xc9d6c0,
    transparent: true,
    opacity: 0.045,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cone = new THREE.Mesh(geometry, material);
  const from = new THREE.Vector3(4.2, 8.6, 3.4);
  const to = new THREE.Vector3(0.2, 0.15, 0);
  cone.position.copy(from);
  const dir = to.clone().sub(from).normalize();
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  return cone;
}

function makeSignalCrack(): { mesh: THREE.Mesh; pulse: (t: number) => void } {
  const geometry = new THREE.BoxGeometry(0.018, 0.86, 0.86);
  const material = new THREE.MeshStandardMaterial({
    color: SIGNAL,
    emissive: SIGNAL,
    emissiveIntensity: 1.4,
    roughness: 0.22,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.set(0.22, 0.18, 0.46);
  return {
    mesh,
    pulse(t: number) {
      const wave = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.15));
      material.emissiveIntensity = 0.9 + wave * 1.6;
      material.opacity = 0.55 + wave * 0.4;
    },
  };
}

export function HeroScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(FIELD, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.pointerEvents = "none";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FIELD);
    scene.fog = new THREE.FogExp2(FIELD, 0.042);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    camera.position.set(-0.35, 1.15, 7.4);
    camera.lookAt(0.55, 0.15, 0);

    const cluster = new THREE.Group();
    cluster.position.set(1.15, 0.35, 0);
    scene.add(cluster);

    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const paperMat = new THREE.MeshStandardMaterial({
      color: PAPER,
      roughness: 0.88,
      metalness: 0.04,
    });

    const cubes: CubeBody[] = CUBE_SLOTS.map((slot, index) => {
      const scale = 0.52 + (index % 3) * 0.05;
      const mesh = new THREE.Mesh(cubeGeo, paperMat);
      mesh.position.set(slot[0], slot[1], slot[2]);
      mesh.scale.setScalar(scale);
      mesh.castShadow = false;
      cluster.add(mesh);
      return {
        mesh,
        rest: new THREE.Vector3(slot[0], slot[1], slot[2]),
        fx: 0.55 + index * 0.11,
        fy: 0.7 + index * 0.09,
        fz: 0.48 + index * 0.07,
        px: index * 0.9,
        py: index * 1.3,
        pz: index * 0.6,
        ax: 0.035 + (index % 2) * 0.015,
        ay: 0.05 + (index % 3) * 0.012,
        az: 0.03 + (index % 2) * 0.01,
      };
    });

    const signalIndex = 3;
    const crack = makeSignalCrack();
    cubes[signalIndex].mesh.add(crack.mesh);

    const grid = new THREE.GridHelper(28, 28, 0x16383e, 0x0c2428);
    grid.position.y = -1.84;
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const mat of gridMats) {
      mat.transparent = true;
      mat.opacity = 0.28;
    }
    scene.add(grid);
    scene.add(makeCircuitTraces());
    scene.add(makeBeam());

    scene.add(new THREE.HemisphereLight(0x8aa8a4, FIELD, 0.42));
    const key = new THREE.SpotLight(0xf3f1e4, 12, 28, 0.38, 0.85, 1.1);
    key.position.set(6.4, 10.2, 4.2);
    key.target.position.set(0.4, 0.1, 0);
    scene.add(key);
    scene.add(key.target);
    const fill = new THREE.DirectionalLight(0x1c3a40, 0.55);
    fill.position.set(-4.5, 2.2, 3.5);
    scene.add(fill);

    const pointer = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const resize = () => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      const desktop = width >= 860;
      cluster.position.set(desktop ? 0.12 : 0.1, desktop ? 0.22 : 0.55, 0);
      camera.position.set(desktop ? 0.2 : 0, desktop ? 1.05 : 1.35, desktop ? 6.6 : 8.1);
      camera.lookAt(desktop ? 0.12 : 0.08, 0.18, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    const clock = new THREE.Clock();

    const draw = (moving: boolean) => {
      const t = moving ? clock.getElapsedTime() : 0.8;
      if (moving) {
        cluster.rotation.y = t * 0.045;
        cluster.rotation.x += (pointer.y * 0.1 - cluster.rotation.x) * 0.045;
        cluster.rotation.z += (pointer.x * -0.12 - cluster.rotation.z) * 0.045;
        for (const cube of cubes) {
          cube.mesh.position.set(
            cube.rest.x + Math.sin(t * cube.fx + cube.px) * cube.ax,
            cube.rest.y + Math.sin(t * cube.fy + cube.py) * cube.ay,
            cube.rest.z + Math.sin(t * cube.fz + cube.pz) * cube.az,
          );
        }
        crack.pulse(t);
      } else {
        crack.pulse(1.2);
      }
      renderer.render(scene, camera);
    };

    const tick = () => {
      draw(true);
      frame = window.requestAnimationFrame(tick);
    };

    if (reduced) {
      draw(false);
    } else {
      tick();
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      observer.disconnect();
      const geos = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          geos.add(obj.geometry);
          const material = obj.material;
          if (Array.isArray(material)) material.forEach((item) => mats.add(item));
          else mats.add(material);
        }
      });
      geos.forEach((item) => item.dispose());
      mats.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="hero-scene" aria-hidden />;
}
