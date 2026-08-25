"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import perseusMark from "@/assets/perseus-mark.png";

type Props = {
  /** Rendered size in CSS pixels — the canvas is square. */
  size?: number;
  className?: string;
};

/**
 * A marca do projeto como a coisa real: a letra P em 3D levantada da placa
 * preta, cambalhotando. Gira em dois eixos ao mesmo tempo — uma volta inteira
 * de lado e outra mais lenta por cima — pra placa ser vista pela direita, pela
 * esquerda, de baixo e de cima, e não só rodando feito moeda.
 *
 * O three.js é importado dentro do efeito pra cair no chunk dele e a primeira
 * pintura continuar sendo o PNG chapado; o canvas substitui a imagem só quando
 * o WebGL está de fato vivo, o que serve de fallback quando não está.
 */
export function PerseusMark3D({ size = 48, className }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const mount = holder.current;
    if (!mount) return;

    // Setado antes de qualquer await: a limpeza pode rodar enquanto o three.js
    // ainda está na rede, e aí nada construído abaixo pode chegar ao DOM.
    let disposed = false;
    let teardown = () => {};

    void (async () => {
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        return; // no three.js, no canvas — the PNG stays.
      }
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return; // no WebGL context — same story.
      }

      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(size, size, false);
      renderer.domElement.style.width = `${size}px`;
      renderer.domElement.style.height = `${size}px`;
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

      // O estúdio do protótipo, menos o plano de chão: a marca é recortada
      // contra o cabeçalho, então sombra de chão não teria onde cair.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(4, 7, 5);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xfff4e6, 0.6);
      fill.position.set(-5, 3, -4);
      scene.add(fill);

      const green = new THREE.MeshStandardMaterial({
        color: 0x1fae6a,
        roughness: 0.26,
        metalness: 0.22,
      });
      const greenDeep = new THREE.MeshStandardMaterial({
        color: 0x11784a,
        roughness: 0.32,
        metalness: 0.2,
      });
      const black = new THREE.MeshStandardMaterial({
        color: 0x15181a,
        roughness: 0.4,
        metalness: 0.22,
      });

      /** Rounded square plate (squircle) with soft bevelled edges. */
      function plate(sizeUnits: number, radius: number, depth: number) {
        const h = sizeUnits / 2;
        const r = radius;
        const s = new THREE.Shape();
        s.moveTo(-h + r, -h);
        s.lineTo(h - r, -h);
        s.quadraticCurveTo(h, -h, h, -h + r);
        s.lineTo(h, h - r);
        s.quadraticCurveTo(h, h, h - r, h);
        s.lineTo(-h + r, h);
        s.quadraticCurveTo(-h, h, -h, h - r);
        s.lineTo(-h, -h + r);
        s.quadraticCurveTo(-h, -h, -h + r, -h);
        const g = new THREE.ExtrudeGeometry(s, {
          depth,
          bevelEnabled: true,
          bevelThickness: depth * 0.34,
          bevelSize: depth * 0.34,
          bevelSegments: 6,
          curveSegments: 24,
        });
        g.translate(0, 0, -depth / 2);
        return new THREE.Mesh(g, black);
      }

      /** P maiúsculo: uma haste em cápsula até a linha de base e um anel de
       *  barriga preenchendo os ~60% de cima da altura da caixa alta, com o topo
       *  alinhado ao da haste. */
      function letterP(capH: number, stroke: number) {
        const g = new THREE.Group();
        const r = stroke;
        const top = capH / 2;
        const bowlR = (capH * 0.6) / 2 - r;
        const bowlY = top - r - bowlR;

        const stem = new THREE.Mesh(
          new THREE.CapsuleGeometry(r, capH - 2 * r, 8, 24),
          green,
        );
        stem.position.set(-bowlR, 0, 0);

        const bowl = new THREE.Mesh(
          new THREE.TorusGeometry(bowlR, r, 16, 48),
          green,
        );
        bowl.position.set(0, bowlY, 0);

        const joint = new THREE.Mesh(
          new THREE.SphereGeometry(r * 1.02, 20, 14),
          greenDeep,
        );
        joint.position.set(-bowlR, bowlY - bowlR, 0);

        g.add(stem, bowl, joint);
        return g;
      }

      const mark = new THREE.Group();
      mark.add(plate(1.62, 0.46, 0.3));
      const p = letterP(1.2, 0.09);
      p.position.set(0.03, 0, 0.3);
      mark.add(p);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.66, 0.02, 12, 64),
        greenDeep,
      );
      halo.position.z = 0.27;
      mark.add(halo);

      // Gira em torno do próprio meio da marca, não de onde a origem da placa
      // por acaso está, senão a cambalhota balançaria fora do centro.
      const box = new THREE.Box3().setFromObject(mark);
      const center = box.getCenter(new THREE.Vector3());
      mark.position.set(-center.x, -center.y, -center.z);
      const pivot = new THREE.Group();
      pivot.add(mark);
      scene.add(pivot);

      // Enquadra a esfera envolvente, não a face chapada: todo ângulo da
      // cambalhota tem que caber na mesma caixa de 48px sem cortar um canto.
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      camera.position.set(
        0,
        0,
        (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.12,
      );
      camera.lookAt(0, 0, 0);

      mount.appendChild(renderer.domElement);
      setLive(true);

      const still = globalThis.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (still) {
        // Parado no ângulo de três quartos de que a marca chapada foi desenhada.
        pivot.rotation.set(-0.18, 0.5, 0);
        renderer.render(scene, camera);
      } else {
        let last = performance.now();
        renderer.setAnimationLoop((now) => {
          const dt = Math.min((now - last) / 1000, 0.1);
          last = now;
          pivot.rotation.y += dt * 0.85;
          pivot.rotation.x += dt * 0.53;
          renderer.render(scene, camera);
        });
      }

      teardown = () => {
        renderer.setAnimationLoop(null);
        renderer.domElement.remove();
        scene.traverse((o) => {
          const mesh = o as import("three").Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
        green.dispose();
        greenDeep.dispose();
        black.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      teardown();
    };
  }, [size]);

  return (
    <span
      className={className}
      style={{ width: size, height: size, display: "block" }}
    >
      <div ref={holder} style={{ display: live ? "block" : "none" }} />
      {!live && (
        <Image
          src={perseusMark}
          alt=""
          priority
          width={size}
          height={size}
          style={{ width: size, height: size }}
        />
      )}
    </span>
  );
}
