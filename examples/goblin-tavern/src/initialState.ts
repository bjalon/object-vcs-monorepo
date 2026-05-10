import type { TavernState } from "./graph.js";

export const initialState: TavernState = {
  tavern: {
    id: "tavern-1",
    name: "La Marmite du Gobelin Dore",
    motto: "On sert chaud, parfois vivant.",
    reputation: 42
  },
  goblins: {
    grubnuk: {
      id: "grubnuk",
      name: "Grubnuk",
      role: "chef",
      mood: "hungry",
      favoriteSnack: "chaussette marinee",
      energy: 78
    },
    zibzab: {
      id: "zibzab",
      name: "Zibzab",
      role: "bard",
      mood: "suspicious",
      favoriteSnack: "fromage qui crie",
      energy: 51
    }
  }
};
