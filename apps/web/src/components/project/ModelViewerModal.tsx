"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Full-screen 3D viewer for a .glb design model (exported from SketchUp,
 * Revit, Blender, …). Plain three.js:
 *
 *   scene + lights → load the GLB → centre it → frame the camera on its
 *   bounding box → orbit controls → render loop.
 *
 * The land owner can drag to orbit, scroll to zoom, and right-drag to pan.
 */
export function ModelViewerModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Escape closes the viewer, like every other overlay in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- Scene, camera, renderer ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17); // studio-dark, works in both themes

    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // --- Lights: soft sky/ground fill plus a keylight for shadowsless depth ---
    scene.add(new THREE.HemisphereLight(0xffffff, 0x44403c, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 10, 7);
    scene.add(key);

    // A subtle ground grid so scale and orientation read instantly.
    const grid = new THREE.GridHelper(50, 50, 0x57534e, 0x292524);
    scene.add(grid);

    // --- Controls: damped orbit around the model ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // --- Load the model ---
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;

        // Centre the model on the origin and sit it on the grid.
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += size.y / 2;
        scene.add(model);

        // Pull the camera back far enough to frame the whole bounding box.
        const distance = Math.max(size.x, size.y, size.z) * 1.6 || 5;
        camera.position.set(distance, distance * 0.7, distance);
        controls.target.set(0, size.y / 2, 0);
        controls.update();

        setStatus("ready");
      },
      undefined,
      () => setStatus("error")
    );

    // --- Render loop + resize ---
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update(); // damping needs a tick every frame
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // --- Cleanup: stop the loop and free the WebGL context ---
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [url]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`3D view of ${title}`} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm">
      {/* The WebGL canvas mounts into this box */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Header bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5">
        <div className="rounded-2xl bg-black/50 px-4 py-2.5 backdrop-blur">
          <p className="text-sm font-extrabold text-white">{title}</p>
          <p className="text-xs text-white/60">Drag to orbit · scroll to zoom · right-drag to pan</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close 3D viewer"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/75"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      {/* Loading / error states over the canvas */}
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center">
          {status === "loading" ? (
            <p className="rounded-full bg-black/60 px-5 py-2.5 text-sm font-bold text-white/90 backdrop-blur">
              Loading model…
            </p>
          ) : (
            <p className="rounded-full bg-rose-500/20 px-5 py-2.5 text-sm font-bold text-rose-200 backdrop-blur">
              Couldn&apos;t load this model — is it a valid .glb file?
            </p>
          )}
        </div>
      )}
    </div>
  );
}
