/*
  The three gifts on the hero card. Static by design: the landing page must
  never depend on the API being up, and this card is a piece of scenery, not a
  data view. `claimed` drives both the satin tag in the 3D scene and the caption
  underneath, so the two can never disagree.
*/

export type HeroGift = {
  id: "vase" | "throw" | "grinder";
  label: string;
  claimed: boolean;
};

export const HERO_GIFTS: readonly HeroGift[] = [
  { id: "vase", label: "Ceramic vase", claimed: false },
  { id: "throw", label: "Linen throw", claimed: true },
  { id: "grinder", label: "Coffee grinder", claimed: true },
];
