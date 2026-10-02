import type { Cast } from "./persona.ts";

/**
 * The Spooky table's cast: monsters, not people, so the bios use whichever pronoun suits the creature. The witch
 * is a she, the skeleton and the mummy are he, and the ghost and the werewolf are left ambiguous, being more cryptid
 * than the rest. Drafts for Caleb to punch up.
 */
export const SPOOKY: Cast = {
  bluffer: {
    name: "Hazel Hex",
    title: "The Hexer",
    bio: "Casts a big spell and dares you to call it. Whether her cauldron holds anything is another matter.",
  },
  honest: {
    name: "Bonesy",
    title: "The Bare Bones",
    bio: "Nothing to hide, nowhere to hide it. Claims what he holds, and rattles when he has to stretch.",
  },
  sandbagger: {
    name: "Old Tut",
    title: "The Tight-Lipped",
    bio: "Wrapped up for three thousand years and in no hurry to unwrap now. Says less than he holds.",
  },
  gambler: {
    name: "Moon Howl",
    title: "The Wild One",
    bio: "Hardly glances at the dice, then howls. Sometimes calls it before looking at all.",
  },
  creeper: {
    name: "Whisper",
    title: "The Drifter",
    bio: "Drifts up the ladder one rung at a time, never quite there. Only the chill says it is close.",
  },
};
