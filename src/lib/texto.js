// Normaliza nombres para comparar/vincular sin fallar por acentos, mayúsculas
// o espacios de más. Ej.: "Leche  en Polvó" → "leche en polvo".
export function normalizarNombre(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
