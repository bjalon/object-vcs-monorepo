import type { TavernState } from "./graph.js";

export const initialState: TavernState = {
  tavern: {
    id: "tavern-1",
    name: "La Marmite du Gobelin Dore",
    motto: "On sert chaud, parfois vivant.",
    reputation: 42
  },
  chaosSettings: {
    theme: "dungeon",
    chaosLevel: 6,
    autosaveDirty: true
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
  },
  menuItems: {
    rock_soup: {
      id: "rock_soup",
      name: "Soupe de cailloux premium",
      pricePebbles: 7,
      weirdness: 3,
      inStock: true
    },
    dragon_omelette: {
      id: "dragon_omelette",
      name: "Omelette de dragon approximatif",
      pricePebbles: 19,
      weirdness: 5,
      inStock: true
    }
  },
  tavernEvents: {
    spoon_incident: {
      id: "spoon_incident",
      title: "La grande disparition des cuilleres",
      severity: "messy",
      resolved: false
    }
  }
};
