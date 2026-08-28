/** Normalizace SPZ – bez mezer a pomlček, velkými písmeny. */
export function normalizePlate(input: string): string {
  return input
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function isValidPlate(input: string): boolean {
  const plate = normalizePlate(input);
  return plate.length >= 5 && plate.length <= 10;
}

/** Zobrazovací tvar české SPZ: "1AB2345" → "1AB 2345". */
export function formatPlate(input: string): string {
  const plate = normalizePlate(input);
  if (/^\d[A-Z]\d{5}$/.test(plate)) return `${plate.slice(0, 3)} ${plate.slice(3)}`;
  if (/^\d[A-Z]{2}\d{4}$/.test(plate)) return `${plate.slice(0, 3)} ${plate.slice(3)}`;
  if (plate.length === 7) return `${plate.slice(0, 3)} ${plate.slice(3)}`;
  return plate;
}
