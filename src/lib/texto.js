// Normaliza nombres para comparar/vincular sin fallar por acentos, mayúsculas,
// espacios de más o puntuación. Ej.: "Leche  en Polvó" → "leche en polvo",
// "Salsa L'heritier" → "salsa lheritier", "Marroc (Panadería)" → "marroc panaderia".
export function normalizarNombre(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’´`]/g, '')       // apóstrofos: L'heritier ↔ Lheritier
    .replace(/[^a-z0-9]+/g, ' ')  // resto de la puntuación (.,-/()…) → espacio
    .trim()
}
