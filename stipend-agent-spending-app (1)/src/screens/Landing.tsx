"use client";

import { useEffect, useRef } from "react";
import { mountLandingScene } from "../hero/scene";
import "../styles.css";

type LandingProps = {
  go: (screen: "account") => void;
};

export default function Landing({ go }: LandingProps) {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sceneRef.current) return;
    return mountLandingScene(sceneRef.current);
  }, []);

  return (
    <main className="stipend-landing">
      <div ref={sceneRef} className="stipend-landing__scene" aria-hidden="true" />
      <div className="stipend-landing__content">
        <div className="stipend-landing__copy">
          <p className="stipend-landing__label">STIPEND</p>
          <h1 className="stipend-landing__headline">
            <span>A cap the</span>
            <span>model</span>
            <span>cannot</span>
            <span>edit.</span>
          </h1>
        </div>
        <button
          type="button"
          className="stipend-landing__button"
          onClick={() => go("account")}
        >
          Set a stipend
        </button>
      </div>
    </main>
  );
}
