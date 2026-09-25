import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { MeshData } from "@/lib/aether/cylmesh";

export interface Face3DHandle {
  /** Turn to a preset: 0 = front, −90 = the person's left side, 90 = their right. */
  view(yawDeg: number): void;
  reset(): void;
}

const SKIN: [number, number, number] = [0.72, 0.74, 0.78];

/**
 * The scan's own 3D surface, drawn with three.js (loaded only when this
 * appears). Drag to turn, pinch or scroll to zoom. Face axes are kept: the
 * person's left is on the viewer's right, as when facing someone.
 */
export const Face3DView = forwardRef<Face3DHandle, { mesh: MeshData; heatmap: boolean }>(function Face3DView(
  { mesh, heatmap },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const control = useRef<Face3DHandle | null>(null);
  useImperativeHandle(ref, () => ({
    view: (y) => control.current?.view(y),
    reset: () => control.current?.reset(),
  }));

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("three").then((THREE) => {
      const el = host.current;
      if (disposed || !el) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const size = () => {
        const w = el.clientWidth || 300;
        const h = el.clientHeight || 300;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.touchAction = "none";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 10, 4000);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x303048, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(250, 300, 500);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x9db4ff, 0.7);
      rim.position.set(-400, 150, -300);
      scene.add(rim);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
      const plain = new Float32Array(mesh.colors.length);
      for (let i = 0; i < plain.length; i += 3) plain.set(SKIN, i);
      geo.setAttribute("color", new THREE.BufferAttribute(heatmap ? mesh.colors : plain, 3));
      geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geo.computeVertexNormals();
      // Centre on the head, not the whole mesh: the neck and upper chest hang
      // below it and would push the face off the top of the view.
      const centre = new THREE.Vector3();
      {
        const p = mesh.positions;
        let n = 0;
        for (let i = 0; i < p.length; i += 3) {
          if (p[i + 1]! < -130) continue;
          centre.x += p[i]!;
          centre.y += p[i + 1]!;
          centre.z += p[i + 2]!;
          n++;
        }
        if (n) centre.multiplyScalar(1 / n);
        centre.y -= 30; // a little of the neck in frame too
      }
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide });
      const obj = new THREE.Mesh(geo, mat);
      obj.position.copy(centre).multiplyScalar(-1);
      const turn = new THREE.Group();
      turn.add(obj);
      scene.add(turn);

      // Three-quarter to start, like the mockup: it shows depth at a glance.
      const start = { yaw: -25, pitch: 5, dist: 820 };
      const state = { ...start };
      let raf = 0;
      const draw = () => {
        raf = 0;
        turn.rotation.set((state.pitch * Math.PI) / 180, (state.yaw * Math.PI) / 180, 0, "YXZ");
        camera.position.set(0, 0, state.dist);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };
      const redraw = () => {
        if (!raf) raf = requestAnimationFrame(draw);
      };
      size();
      redraw();

      // Pointer control: one finger turns, two pinch.
      const pts = new Map<number, { x: number; y: number }>();
      let pinch = 0;
      const down = (e: PointerEvent) => {
        el.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        }
      };
      const move = (e: PointerEvent) => {
        const last = pts.get(e.pointerId);
        if (!last) return;
        if (pts.size === 1) {
          state.yaw += (e.clientX - last.x) * 0.5;
          state.pitch = Math.max(-60, Math.min(60, state.pitch + (e.clientY - last.y) * 0.4));
        }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          if (pinch) state.dist = Math.max(250, Math.min(1400, state.dist * (pinch / d)));
          pinch = d;
        }
        redraw();
      };
      const up = (e: PointerEvent) => {
        pts.delete(e.pointerId);
        pinch = 0;
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        state.dist = Math.max(250, Math.min(1400, state.dist * (1 + e.deltaY * 0.001)));
        redraw();
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("wheel", wheel, { passive: false });
      const ro = new ResizeObserver(() => {
        size();
        redraw();
      });
      ro.observe(el);

      control.current = {
        view: (y) => {
          state.yaw = y;
          state.pitch = 0;
          redraw();
        },
        reset: () => {
          Object.assign(state, start);
          redraw();
        },
      };

      cleanup = () => {
        ro.disconnect();
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        el.removeEventListener("wheel", wheel);
        if (raf) cancelAnimationFrame(raf);
        geo.dispose();
        mat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        control.current = null;
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [mesh, heatmap]);

  return <div ref={host} className="size-full" data-no-swipe-nav />;
});
