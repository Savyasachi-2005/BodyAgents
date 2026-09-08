import type { OrganId } from "./anatomy-data";

export type PersonaId =
  | "brain"
  | "heart"
  | "lungs"
  | "bones"
  | "liver"
  | "kidneys"
  | "eyeball"
  | "intestine"
  | "pancreas"
  | "skin"
  | "digestive";

export const PERSONA_IDS: PersonaId[] = [
  "brain",
  "heart",
  "lungs",
  "bones",
  "liver",
  "kidneys",
  "eyeball",
  "intestine",
  "pancreas",
  "skin",
  "digestive",
];

/** Map each organ library entry to its own organ chat persona. */
export const organToPersona: Record<OrganId, PersonaId> = {
  brain: "brain",
  heart: "heart",
  lungs: "lungs",
  bones: "bones",
  liver: "liver",
  kidneys: "kidneys",
  eyeball: "eyeball",
  intestine: "intestine",
  pancreas: "pancreas",
  skin: "skin",
};

export function personaForOrgan(organId: OrganId): PersonaId {
  return organToPersona[organId];
}

export const personaLabels: Record<PersonaId, string> = {
  brain: "Brain",
  heart: "Heart",
  lungs: "Lungs",
  bones: "Bones",
  liver: "Liver",
  kidneys: "Kidneys",
  eyeball: "Eye",
  intestine: "Intestine",
  pancreas: "Pancreas",
  skin: "Skin",
  digestive: "Digestive System",
};
