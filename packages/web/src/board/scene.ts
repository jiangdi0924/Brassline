/**
 * three.js 棋盘：从 GameState 增量更新网格。对外只暴露 build / update / pick / dispose。
 * 可拾取对象的 userData：{ kind: 'location'|'merchant'|'slot'|'link', id, slotIndex?, linkIndex? }
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { LINKS, LOCATIONS, MERCHANTS, type GameState, type IndustryType } from '@brassline/engine';
import { MERCHANT_IDS, SCALE, world } from './layout';

export type PickTarget =
  | { kind: 'location'; id: string }
  | { kind: 'merchant'; id: string }
  | { kind: 'slot'; id: string; slotIndex: number }
  | { kind: 'link'; linkIndex: number };

export const PLAYER_COLORS = [0xd9534f, 0x4a7fd6, 0xf0ad4e, 0x5cb85c];
const INDUSTRY_COLORS: Record<IndustryType, number> = {
  cotton: 0xf2e9d8, manufacturer: 0xc99a5b, pottery: 0x8bb8d6,
  coal: 0x333333, iron: 0xd17a3a, brewery: 0x7a5230,
};

export interface Highlights {
  slots: Set<string>;      // `${locationId}:${slotIndex}`
  links: Set<number>;
  merchants: Set<string>;
}

export class BoardScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer = new CSS2DRenderer();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly slotMeshes = new Map<string, THREE.Mesh>();
  private readonly linkMeshes = new Map<number, THREE.Mesh>();
  private readonly tileGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private frame = 0;
  private readonly abort = new AbortController();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    container.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);
    this.camera.position.set(4 * SCALE, 38, 7 * SCALE + 26);
    this.camera.lookAt(4 * SCALE, 0, 7 * SCALE);

    this.scene.background = new THREE.Color(0xe8e1d1);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x807060, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(20, 40, 10);
    this.scene.add(sun);
    this.scene.add(this.tileGroup);
    this.buildStatic();
    this.installCameraControls();
    this.loop();
  }

  private buildStatic(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(14 * SCALE, 18 * SCALE),
      new THREE.MeshLambertMaterial({ color: 0xb9c7a0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(4 * SCALE, -0.05, 6.5 * SCALE);
    this.scene.add(ground);

    for (const [id, loc] of Object.entries(LOCATIONS)) {
      const { x, z } = world(id);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.7, 0.3, 24),
        new THREE.MeshLambertMaterial({ color: 0xcfc3a8 }),
      );
      base.position.set(x, 0.15, z);
      base.userData = { kind: 'location', id } satisfies PickTarget;
      this.scene.add(base);
      this.pickables.push(base);
      this.addLabel(base, loc.name, 'loc-label');
      loc.slots.forEach((slot, i) => {
        const n = loc.slots.length;
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = n === 1 ? 0 : 0.8;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.1, 0.7),
          new THREE.MeshLambertMaterial({ color: INDUSTRY_COLORS[slot.industries[0]!] }),
        );
        m.position.set(x + Math.cos(ang) * r, 0.35, z + Math.sin(ang) * r);
        m.userData = { kind: 'slot', id, slotIndex: i } satisfies PickTarget;
        this.scene.add(m);
        this.pickables.push(m);
        this.slotMeshes.set(`${id}:${i}`, m);
      });
    }
    for (const id of Object.keys(MERCHANTS)) {
      const { x, z } = world(id);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.4, 1.6),
        new THREE.MeshLambertMaterial({ color: 0x8c2f39 }),
      );
      m.position.set(x, 0.2, z);
      m.userData = { kind: 'merchant', id } satisfies PickTarget;
      this.scene.add(m);
      this.pickables.push(m);
      this.addLabel(m, id[0]!.toUpperCase() + id.slice(1), 'merchant-label');
    }
    LINKS.forEach((l, i) => {
      const a = world(l.a);
      const b = world(l.b);
      const len = Math.hypot(b.x - a.x, b.z - a.z) - 3;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.08, 0.35),
        new THREE.MeshLambertMaterial({ color: 0xa89f8c, transparent: true, opacity: 0.5 }),
      );
      m.position.set((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2);
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      m.userData = { kind: 'link', linkIndex: i } satisfies PickTarget;
      this.scene.add(m);
      this.pickables.push(m);
      this.linkMeshes.set(i, m);
    });
  }

  private addLabel(parent: THREE.Object3D, text: string, cls: string): void {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    const label = new CSS2DObject(div);
    label.position.set(0, 1.2, 1.9);
    parent.add(label);
  }

  /** 按状态重建动态物体：板块、资源、Link 颜色。每次行动后调用一次，开销可忽略。 */
  update(state: GameState, hl: Highlights): void {
    for (const o of this.tileGroup.children) {
      const m = o as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.tileGroup.clear();
    for (const [id, slots] of Object.entries(state.board.slots)) {
      slots.forEach((t, i) => {
        const slotMesh = this.slotMeshes.get(`${id}:${i}`);
        if (!slotMesh) return;
        const mat = slotMesh.material as THREE.MeshLambertMaterial;
        mat.emissive.setHex(hl.slots.has(`${id}:${i}`) ? 0x33aa33 : 0x000000);
        if (!t) return;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.5, 0.7),
          new THREE.MeshLambertMaterial({ color: PLAYER_COLORS[t.player] ?? 0x888888 }),
        );
        box.position.copy(slotMesh.position).add(new THREE.Vector3(0, 0.3, 0));
        this.tileGroup.add(box);
        const top = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.06, 0.6),
          new THREE.MeshLambertMaterial({ color: t.flipped ? 0x1b1b1b : INDUSTRY_COLORS[t.tile.industry] }),
        );
        top.position.copy(box.position).add(new THREE.Vector3(0, 0.28, 0));
        this.tileGroup.add(top);
        for (let r = 0; r < t.resources; r++) {
          const cube = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, 0.18),
            new THREE.MeshLambertMaterial({
              color: t.tile.industry === 'coal' ? 0x111111 : t.tile.industry === 'iron' ? 0xe08a3c : 0xc8a24a,
            }),
          );
          cube.position.copy(box.position).add(new THREE.Vector3(-0.25 + (r % 3) * 0.25, 0.42 + Math.floor(r / 3) * 0.2, 0.45));
          this.tileGroup.add(cube);
        }
      });
    }
    for (const [i, m] of this.linkMeshes) {
      const mat = m.material as THREE.MeshLambertMaterial;
      const built = state.board.links.find((l) => l.linkIndex === i);
      const def = LINKS[i]!;
      const available = state.era === 'canal' ? def.canal : def.rail;
      mat.color.setHex(built ? PLAYER_COLORS[built.player]! : available ? 0xa89f8c : 0xd8d2c4);
      mat.opacity = built ? 1 : available ? 0.5 : 0.2;
      mat.emissive.setHex(hl.links.has(i) ? 0x33aa33 : 0x000000);
    }
    for (const id of MERCHANT_IDS) {
      const m = this.pickables.find((o) => o.userData.kind === 'merchant' && o.userData.id === id) as THREE.Mesh;
      (m.material as THREE.MeshLambertMaterial).emissive.setHex(hl.merchants.has(id) ? 0x33aa33 : 0x000000);
    }
  }

  pick(clientX: number, clientY: number): PickTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return hit ? (hit.object.userData as PickTarget) : null;
  }

  private installCameraControls(): void {
    const el = this.renderer.domElement;
    let dragging = false;
    let last = { x: 0, y: 0 };
    const signal = this.abort.signal;
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.button === 1) { dragging = true; last = { x: e.clientX, y: e.clientY }; }
    }, { signal });
    window.addEventListener('pointerup', () => (dragging = false), { signal });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const k = this.camera.position.y / 600;
      this.camera.position.x -= (e.clientX - last.x) * k;
      this.camera.position.z -= (e.clientY - last.y) * k;
      last = { x: e.clientX, y: e.clientY };
    }, { signal });
    el.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.001);
      this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y * f, 12, 80);
    }, { passive: false, signal });
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
