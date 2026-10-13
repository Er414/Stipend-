"use client";

import { HeroScene } from "./HeroScene";

type LandingHeroProps = {
  onStart: () => void;
};

export function LandingHero({ onStart }: LandingHeroProps) {
  return (
    <section className="landing">
      <HeroScene />
      <div className="landing-copy">
        <p className="landing-kicker">Stipend</p>
        <h1 className="landing-claim">A cap the model cannot edit.</h1>
        <button className="btn btn-primary landing-cta" onClick={onStart}>
          Set a stipend
        </button>
      </div>
    </section>
  );
}
