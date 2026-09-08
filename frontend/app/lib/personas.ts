import type { OrganId } from "./anatomy-data";

export type PersonaId = "brain" | "heart" | "lungs" | "bones" | "digestive";

export const PERSONA_IDS: PersonaId[] = ["brain", "heart", "lungs", "bones", "digestive"];

/** Map UI organs to BodyAgents chat personas. */
export const organToPersona: Partial<Record<OrganId, PersonaId>> = {
  brain: "brain",
  heart: "heart",
  lungs: "lungs",
  bones: "bones",
  intestine: "digestive",
  liver: "digestive",
  pancreas: "digestive",
};

export function personaForOrgan(organId: OrganId): PersonaId | null {
  return organToPersona[organId] ?? null;
}

export const personaLabels: Record<PersonaId, string> = {
  brain: "Brain",
  heart: "Heart",
  lungs: "Lungs",
  bones: "Bones",
  digestive: "Digestive System",
};
