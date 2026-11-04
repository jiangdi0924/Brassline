import { useEffect, useRef } from 'react';
import type { GameState } from '@brassline/engine';
import { BoardScene, type Highlights, type PickTarget } from './scene';

interface Props {
  state: GameState;
  highlights: Highlights;
  onPick(target: PickTarget): void;
}

export function BoardCanvas({ state, highlights, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const scene = new BoardScene(ref.current!);
    sceneRef.current = scene;
    const el = scene.renderer.domElement;
    const click = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const t = scene.pick(e.clientX, e.clientY);
      if (t) onPickRef.current(t);
    };
    el.addEventListener('click', click);
    const onResize = () => scene.resize();
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('click', click);
      window.removeEventListener('resize', onResize);
      scene.dispose();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.update(state, highlights);
  }, [state, highlights]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'clip' }} />;
}
