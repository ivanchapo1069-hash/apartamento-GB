export const SECTION_ORDER = [
  "Cozinha",
  "Área de serviço",
  "Sacada gourmet",
  "Banheiro da suíte",
  "Banheiro dos meninos",
  "Lavabo",
  "Climatização e eletrônicos",
  "Camas e colchões",
  "Iluminação e acessórios especiais",
];

export function sortSections(sections: string[]): string[] {
  return [...sections].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "pt-BR");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}
