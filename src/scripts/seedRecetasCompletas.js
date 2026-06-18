// Ejecutar con: node --env-file=.env src/scripts/seedRecetasCompletas.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

// ─── DATA ────────────────────────────────────────────────────────────────────

const basesData = [
  { nombre: 'Alfajor del Parque', litros_batch: 120, ingredientes: [
    { nombre: 'Alfajor (Plancha)', cantidad: 5, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { nombre: 'LPE', cantidad: 7.2, unidad: 'kg' },
    { nombre: 'Crema de Leche', cantidad: 13, unidad: 'kg' },
    { nombre: 'DDL Heladero', cantidad: 9, unidad: 'kg' },
    { nombre: 'DDL Heladero Suave', cantidad: 9, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 9.6, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 2.6, unidad: 'kg' },
    { nombre: 'Cacao 2224', cantidad: 1.5, unidad: 'kg' },
    { nombre: 'Cobertura Amarga 99', cantidad: 1.5, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 57, unidad: 'L' },
  ]},
  { nombre: 'Cereza', litros_batch: 120, ingredientes: [
    { nombre: 'LPE', cantidad: 18, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 6, unidad: 'kg' },
    { nombre: 'Cremix', cantidad: 3.6, unidad: 'kg' },
    { nombre: 'Crema de Leche', cantidad: 9.6, unidad: 'L' },
    { nombre: 'Agua', cantidad: 64.8, unidad: 'L' },
    { nombre: 'Estabilizador de Cereza', cantidad: 2, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate', litros_batch: 120, ingredientes: [
    { nombre: 'Mielina', cantidad: 4, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 60, unidad: 'L' },
    { nombre: 'LPE', cantidad: 11.6, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 18, unidad: 'kg' },
    { nombre: 'Cobertura Amarga 99', cantidad: 4, unidad: 'kg' },
    { nombre: 'Cacao 2224', cantidad: 5, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 2, unidad: 'kg' },
    { nombre: 'Crema de Leche', cantidad: 12, unidad: 'L' },
  ]},
  { nombre: 'Chocolate Dubai', litros_batch: 84, ingredientes: [
    { nombre: 'Mielina', cantidad: 2.8, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 61.8, unidad: 'L' },
    { nombre: 'LPE', cantidad: 12.74, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 17.28, unidad: 'kg' },
    { nombre: 'Cobertura Amarga 99', cantidad: 2.8, unidad: 'kg' },
    { nombre: 'Cacao 2224', cantidad: 3.5, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 2.48, unidad: 'kg' },
    { nombre: 'Crema de Leche', cantidad: 7.2, unidad: 'L' },
  ]},
  { nombre: 'Chocolate Amargo', litros_batch: 120, ingredientes: [
    { nombre: 'Crema de Leche', cantidad: 11, unidad: 'L' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 18, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 2, unidad: 'kg' },
    { nombre: 'Mielina', cantidad: 5.5, unidad: 'kg' },
    { nombre: 'Cacao 2224', cantidad: 6.5, unidad: 'kg' },
    { nombre: 'LPE', cantidad: 8, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 60, unidad: 'L' },
    { nombre: 'Cobertura Amarga 99', cantidad: 5, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate Blanco', litros_batch: 120, ingredientes: [
    { nombre: 'Crema de Leche', cantidad: 12, unidad: 'L' },
    { nombre: 'LPE', cantidad: 15.4, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 3.6, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { nombre: 'Chocolate cobertura Blanco', cantidad: 5, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { nombre: 'Pasta chocolate cobertura blanco', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Chocotorta', litros_batch: 120, ingredientes: [
    { nombre: 'Crema de Leche', cantidad: 6, unidad: 'L' },
    { nombre: 'LPE', cantidad: 4, unidad: 'kg' },
    { nombre: 'Queso Crema', cantidad: 8, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 3.2, unidad: 'kg' },
    { nombre: 'Fructosoft', cantidad: 2.4, unidad: 'kg' },
    { nombre: 'DDL Heladero', cantidad: 25.6, unidad: 'kg' },
    { nombre: 'Pasta chantilly', cantidad: 4.6, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 60, unidad: 'L' },
    { nombre: 'Chocolinas', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Dulce de Leche', litros_batch: 120, ingredientes: [
    { nombre: 'Crema de Leche', cantidad: 15, unidad: 'L' },
    { nombre: 'Agua', cantidad: 54, unidad: 'L' },
    { nombre: 'Fructosoft', cantidad: 4, unidad: 'kg' },
    { nombre: 'DDL Heladero', cantidad: 24, unidad: 'kg' },
    { nombre: 'DDL Heladero Suave', cantidad: 22, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
  ]},
  { nombre: 'Mascarpone', litros_batch: 120, ingredientes: [
    { nombre: 'Crema de Leche', cantidad: 12, unidad: 'L' },
    { nombre: 'LPE', cantidad: 15.4, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { nombre: 'Dextroza', cantidad: 3.6, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { nombre: 'Queso Crema', cantidad: 10, unidad: 'kg' },
    { nombre: 'Pasta Mascarpone', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Neutra Agua', litros_batch: 120, ingredientes: [
    { nombre: 'Prestigio', cantidad: 2, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 78, unidad: 'L' },
    { nombre: 'Dextroza', cantidad: 11, unidad: 'kg' },
    { nombre: 'Fructosoft', cantidad: 4, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 22, unidad: 'kg' },
  ]},
  { nombre: 'Neutra Leche', litros_batch: 120, ingredientes: [
    { nombre: 'Crema de Leche', cantidad: 12, unidad: 'L' },
    { nombre: 'LPE', cantidad: 15.4, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { nombre: 'Dextroza', cantidad: 3.6, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
  ]},
  { nombre: 'Pistacho Selección Especial', litros_batch: 120, ingredientes: [
    { nombre: 'LPE', cantidad: 19, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 84, unidad: 'L' },
    { nombre: 'DPO Master 50 SE', cantidad: 5, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 16, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 4.6, unidad: 'kg' },
    { nombre: 'Mielina', cantidad: 2.4, unidad: 'kg' },
    { nombre: 'Pasta Pistakion', cantidad: 9, unidad: 'kg' },
  ]},
  { nombre: 'Sambayon', litros_batch: 120, ingredientes: [
    { nombre: 'Crema de Leche', cantidad: 50, unidad: 'L' },
    { nombre: 'Huevo', cantidad: 52, unidad: 'u' },
    { nombre: 'Vino Marsala', cantidad: 24.6, unidad: 'L' },
    { nombre: 'Pasta Sambayon', cantidad: 3.6, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 4, unidad: 'kg' },
  ]},
  { nombre: 'Flan', litros_batch: 120, ingredientes: [
    { nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { nombre: 'LPE', cantidad: 18, unidad: 'kg' },
    { nombre: 'Crema de Leche', cantidad: 9.6, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 3.4, unidad: 'kg' },
    { nombre: 'Cremix', cantidad: 3.4, unidad: 'kg' },
    { nombre: 'Estabilizador de vainilla', cantidad: 1.8, unidad: 'kg' },
    { nombre: 'Pasta Vainilla', cantidad: 1, unidad: 'kg' },
  ]},
  { nombre: 'Vainilla', litros_batch: 120, ingredientes: [
    { nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { nombre: 'LPE', cantidad: 18, unidad: 'kg' },
    { nombre: 'Crema de Leche', cantidad: 9.6, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 3.4, unidad: 'kg' },
    { nombre: 'Cremix', cantidad: 3.4, unidad: 'kg' },
    { nombre: 'Estabilizador de vainilla', cantidad: 2, unidad: 'kg' },
    { nombre: 'Pasta Vainilla', cantidad: 2, unidad: 'kg' },
  ]},
]

const saboresData = [
  { nombre: 'Chocolate', base_nombre: 'Chocolate', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate', cantidad: 120, unidad: 'L' },
  ]},
  { nombre: 'Chocolate del Parque', base_nombre: 'Chocolate', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate', cantidad: 120, unidad: 'L' },
    { nombre: 'Pionono', cantidad: 8, unidad: 'kg' },
    { nombre: 'DDL con rhum', cantidad: 20, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate Selva Negra', base_nombre: 'Chocolate', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate', cantidad: 120, unidad: 'L' },
    { nombre: 'Rhum', cantidad: 1, unidad: 'L' },
    { nombre: 'Frutilla para sembrar', cantidad: 10, unidad: 'kg' },
    { nombre: 'Cereza partidas', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate con Almendras', base_nombre: 'Chocolate', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate', cantidad: 120, unidad: 'L' },
    { nombre: 'Almendra', cantidad: 7, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 3, unidad: 'kg' },
    { nombre: 'Whisky', cantidad: 1, unidad: 'L' },
  ]},
  { nombre: 'Chocolate Suizo', base_nombre: 'Chocolate', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate', cantidad: 120, unidad: 'L' },
    { nombre: 'Granizado SupLay', cantidad: 8, unidad: 'kg' },
    { nombre: 'DDL con rhum', cantidad: 30, unidad: 'kg' },
    { nombre: 'Rhum', cantidad: 1, unidad: 'L' },
  ]},
  { nombre: 'Chocolate Amargo', base_nombre: 'Chocolate Amargo', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate amargo', cantidad: 120, unidad: 'L' },
  ]},
  { nombre: 'Chocolate Kinder', base_nombre: 'Chocolate Blanco', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate Blanco', cantidad: 120, unidad: 'L' },
    { nombre: 'Chocolate kinder', cantidad: 8, unidad: 'kg' },
    { nombre: 'Veteado Ovo King', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate Toffi Blanco', base_nombre: 'Chocolate Blanco', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate Blanco', cantidad: 120, unidad: 'L' },
    { nombre: 'Chocolate granulado blanco', cantidad: 8, unidad: 'kg' },
    { nombre: 'DDL con rhum', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Chocotorta', base_nombre: 'Chocotorta', litros_base: 120, ingredientes: [
    { nombre: 'Chocotorta', cantidad: 120, unidad: 'L' },
    { nombre: 'Chocotorta', cantidad: 20, unidad: 'kg' },
  ]},
  { nombre: 'DDL Crema', base_nombre: 'Dulce de Leche', litros_base: 120, ingredientes: [
    { nombre: 'Dulce de Leche', cantidad: 120, unidad: 'L' },
  ]},
  { nombre: 'DDL Brownie', base_nombre: 'Dulce de Leche', litros_base: 120, ingredientes: [
    { nombre: 'Dulce de Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Brownie Panaderia', cantidad: 11, unidad: 'kg' },
  ]},
  { nombre: 'DDL Nuez', base_nombre: 'Dulce de Leche', litros_base: 120, ingredientes: [
    { nombre: 'Dulce de Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Nuez', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'DDL Granizado', base_nombre: 'Dulce de Leche', litros_base: 120, ingredientes: [
    { nombre: 'Dulce de Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Granizado SupLay', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'DDL Marroc', base_nombre: 'Dulce de Leche', litros_base: 120, ingredientes: [
    { nombre: 'Dulce de Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Chocolate marroc Panaderia', cantidad: 13, unidad: 'kg' },
  ]},
  { nombre: 'DDL Tentacion', base_nombre: 'Dulce de Leche', litros_base: 120, ingredientes: [
    { nombre: 'Dulce de Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'DDL para sembrar', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Frutilla Agua', base_nombre: 'Neutra Agua', litros_base: 90, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 90, unidad: 'L' },
    { nombre: 'Frutilla natural', cantidad: 30, unidad: 'kg' },
    { nombre: 'Jugo limon', cantidad: 1, unidad: 'L' },
    { nombre: 'Pasta frutilla', cantidad: 8, unidad: 'kg' },
  ]},
  { nombre: 'Frutos Patagonicos', base_nombre: 'Neutra Agua', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 120, unidad: 'L' },
    { nombre: 'Frambuesa', cantidad: 8, unidad: 'kg' },
    { nombre: 'Moras', cantidad: 8, unidad: 'kg' },
    { nombre: 'Arandanos', cantidad: 8, unidad: 'kg' },
    { nombre: 'Jugo limon', cantidad: 1, unidad: 'L' },
  ]},
  { nombre: 'Durazno', base_nombre: 'Neutra Agua', litros_base: 90, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 90, unidad: 'L' },
    { nombre: 'Durazno natural', cantidad: 30, unidad: 'kg' },
    { nombre: 'Pasta durazno', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Anana', base_nombre: 'Neutra Agua', litros_base: 90, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 90, unidad: 'L' },
    { nombre: 'Anana Rodajas', cantidad: 27, unidad: 'kg' },
    { nombre: 'Pasta anana', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Naranja', base_nombre: 'Neutra Agua', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta naranja', cantidad: 5, unidad: 'kg' },
    { nombre: 'Acido Naranja', cantidad: 5, unidad: 'kg' },
    { nombre: 'Cascara naranja', cantidad: 15, unidad: 'kg' },
  ]},
  { nombre: 'Maracuya', base_nombre: 'Neutra Agua', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta maracuya', cantidad: 10, unidad: 'kg' },
    { nombre: 'Veteado maracuya', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Pomelo Rosado', base_nombre: 'Neutra Agua', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta pomelo', cantidad: 5, unidad: 'kg' },
    { nombre: 'Acido pomelo', cantidad: 5, unidad: 'kg' },
  ]},
  { nombre: 'Limon Agua', base_nombre: 'Neutra Agua', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta limon', cantidad: 3, unidad: 'kg' },
    { nombre: 'Acido limon', cantidad: 2, unidad: 'kg' },
    { nombre: 'Jugo limon', cantidad: 4, unidad: 'L' },
  ]},
  { nombre: 'Canela', base_nombre: 'Neutra Agua', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 120, unidad: 'L' },
    { nombre: 'Jugo limon', cantidad: 1, unidad: 'L' },
    { nombre: 'Canela en rama', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Manzana', base_nombre: 'Neutra Agua', litros_base: 90, ingredientes: [
    { nombre: 'Neutra Agua', cantidad: 90, unidad: 'L' },
    { nombre: 'Pasta Manzana Verde', cantidad: 10, unidad: 'kg' },
    { nombre: 'Manzana Verde', cantidad: 20, unidad: 'kg' },
  ]},
  { nombre: 'Almendrado', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta Almendra', cantidad: 6, unidad: 'kg' },
    { nombre: 'Almendra', cantidad: 7, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Alcayota C/Nuez', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { nombre: 'Alcayota', cantidad: 15, unidad: 'kg' },
    { nombre: 'Nuez', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Alfajor del Parque', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Alfajor (Plancha)', cantidad: 7, unidad: 'kg' },
    { nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { nombre: 'LPE', cantidad: 7, unidad: 'kg' },
    { nombre: 'DDL Heladero', cantidad: 18, unidad: 'kg' },
    { nombre: 'Veteado Ovo King', cantidad: 11, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 10, unidad: 'kg' },
    { nombre: 'Dextroza', cantidad: 3, unidad: 'kg' },
    { nombre: 'Cacao 2224', cantidad: 2, unidad: 'kg' },
    { nombre: 'Cobertura Amarga 99', cantidad: 2, unidad: 'kg' },
  ]},
  { nombre: 'Americana', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 8, unidad: 'kg' },
  ]},
  { nombre: 'Baileys', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta Crema whisky', cantidad: 4, unidad: 'kg' },
    { nombre: 'Crema de Leche', cantidad: 4, unidad: 'kg' },
    { nombre: 'Veteado whisky', cantidad: 9, unidad: 'L' },
  ]},
  { nombre: 'Banana Split', base_nombre: 'Neutra Leche', litros_base: 90, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 90, unidad: 'L' },
    { nombre: 'Pasta banana', cantidad: 8, unidad: 'kg' },
    { nombre: 'Bananas', cantidad: 30, unidad: 'kg' },
    { nombre: 'DDL para sembrar', cantidad: 20, unidad: 'kg' },
  ]},
  { nombre: 'Bananita Dolca', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta bananita', cantidad: 6, unidad: 'kg' },
    { nombre: 'Veteado Bananita', cantidad: 9, unidad: 'kg' },
  ]},
  { nombre: 'Cafe Irlandes', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Cafe instantaneo', cantidad: 3, unidad: 'kg' },
    { nombre: 'Whisky', cantidad: 2, unidad: 'L' },
  ]},
  { nombre: 'Cereza', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta Cereza', cantidad: 1, unidad: 'kg' },
    { nombre: 'Cereza partidas', cantidad: 15, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate Rocher', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta rocher', cantidad: 9, unidad: 'kg' },
    { nombre: 'Mielina', cantidad: 2.4, unidad: 'kg' },
    { nombre: 'Veteado Rocher', cantidad: 9, unidad: 'kg' },
  ]},
  { nombre: 'Coco', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Coco rallado', cantidad: 5, unidad: 'kg' },
    { nombre: 'Mielina', cantidad: 3, unidad: 'kg' },
    { nombre: 'Pasta coco', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Coco con Almendras', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Coco rallado', cantidad: 5, unidad: 'kg' },
    { nombre: 'Pasta coco', cantidad: 6, unidad: 'kg' },
    { nombre: 'Mielina', cantidad: 2.4, unidad: 'kg' },
    { nombre: 'Almendra', cantidad: 7, unidad: 'kg' },
    { nombre: 'Azucar', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Crema Cookies', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { nombre: 'Oreo', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Crema Rusa', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta rusa', cantidad: 4, unidad: 'kg' },
    { nombre: 'Nuez', cantidad: 15, unidad: 'kg' },
    { nombre: 'Whisky', cantidad: 2, unidad: 'L' },
  ]},
  { nombre: 'Flan', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta vainilla', cantidad: 2, unidad: 'kg' },
    { nombre: 'Polvo Flan', cantidad: 5, unidad: 'kg' },
    { nombre: 'Pasta Caramelo Salado', cantidad: 4, unidad: 'kg' },
  ]},
  { nombre: 'Frutilla Crema', base_nombre: 'Neutra Leche', litros_base: 90, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 90, unidad: 'L' },
    { nombre: 'Pasta frutilla', cantidad: 6, unidad: 'kg' },
    { nombre: 'Frutilla para sembrar', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Frutilla Reina', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { nombre: 'Frutilla para sembrar', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Frutos del Bosque', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta frutos del bosque', cantidad: 6, unidad: 'kg' },
    { nombre: 'Veteado Frutos del Bosque', cantidad: 10.5, unidad: 'kg' },
  ]},
  { nombre: 'Frutos Rojos', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { nombre: 'Nuez', cantidad: 4, unidad: 'kg' },
    { nombre: 'Frutilla para sembrar', cantidad: 5, unidad: 'kg' },
    { nombre: 'Moras natural', cantidad: 3, unidad: 'kg' },
    { nombre: 'Cereza Partidas', cantidad: 5, unidad: 'kg' },
    { nombre: 'Arandanos', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Granizado', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { nombre: 'Granizado SupLay', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Higos al Coñac', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { nombre: 'Higos', cantidad: 20, unidad: 'kg' },
    { nombre: 'Rhum', cantidad: 1, unidad: 'L' },
  ]},
  { nombre: 'Lemon Pie', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta lemon pie', cantidad: 4, unidad: 'kg' },
    { nombre: 'Veteado lemon pie', cantidad: 7, unidad: 'kg' },
    { nombre: 'Acido lemon pie', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Limon Crema', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta limon', cantidad: 3, unidad: 'kg' },
    { nombre: 'Jugo limon', cantidad: 4, unidad: 'kg' },
  ]},
  { nombre: 'Vainilla Crema', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta vainilla', cantidad: 5, unidad: 'kg' },
  ]},
  { nombre: 'Mantecol', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta mantecol', cantidad: 20, unidad: 'kg' },
    { nombre: 'Mielina', cantidad: 2.4, unidad: 'kg' },
    { nombre: 'Veteado mapcol', cantidad: 12, unidad: 'kg' },
  ]},
  { nombre: 'Mascarpone', base_nombre: 'Mascarpone', litros_base: 120, ingredientes: [
    { nombre: 'Mascarpone', cantidad: 120, unidad: 'L' },
    { nombre: 'Veteado frutos del bosque', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Menta Granizada', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta menta', cantidad: 6, unidad: 'kg' },
    { nombre: 'Granizado SupLay', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Moscatel al Rhum', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta malaga', cantidad: 10, unidad: 'kg' },
    { nombre: 'Veteado malaga', cantidad: 12, unidad: 'kg' },
  ]},
  { nombre: 'Polonesa', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Durazno para sembrar', cantidad: 20, unidad: 'kg' },
    { nombre: 'Polonesa para sembrar', cantidad: 7, unidad: 'kg' },
  ]},
  { nombre: 'Quinotos al Whisky', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { nombre: 'Quinotos', cantidad: 20, unidad: 'kg' },
    { nombre: 'Whisky', cantidad: 2, unidad: 'L' },
  ]},
  { nombre: 'Strudell Manzana', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta tarta manzana', cantidad: 6, unidad: 'kg' },
    { nombre: 'Veteado tarta manzana', cantidad: 12, unidad: 'kg' },
  ]},
  { nombre: 'Tiramisu', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta tiramizu', cantidad: 8.4, unidad: 'kg' },
    { nombre: 'Pionono', cantidad: 6, unidad: 'kg' },
    { nombre: 'Cacao 2224', cantidad: 1, unidad: 'kg' },
  ]},
  { nombre: 'Tramontana', base_nombre: 'Neutra Leche', litros_base: 120, ingredientes: [
    { nombre: 'Neutra Leche', cantidad: 120, unidad: 'L' },
    { nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { nombre: 'Microgalletas', cantidad: 8, unidad: 'kg' },
    { nombre: 'DDL para sembrar', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Pistacho', base_nombre: 'Pistacho Selección Especial', litros_base: 120, ingredientes: [
    { nombre: 'Pistacho Selección Especial', cantidad: 120, unidad: 'L' },
    { nombre: 'Pistacho X Kg', cantidad: 7, unidad: 'kg' },
  ]},
  { nombre: 'Sambayon', base_nombre: 'Sambayon', litros_base: 120, ingredientes: [
    { nombre: 'Sambayon', cantidad: 120, unidad: 'L' },
  ]},
  { nombre: 'Americana Light', base_nombre: 'Americana Light', litros_base: 120, ingredientes: [
    { nombre: 'LPE', cantidad: 1, unidad: 'kg' },
    { nombre: 'Pronto SENZA Chantilli', cantidad: 2, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 4, unidad: 'L' },
  ]},
  { nombre: 'Chocolate Light', base_nombre: 'Chocolate Light', litros_base: 120, ingredientes: [
    { nombre: 'LPE', cantidad: 1, unidad: 'kg' },
    { nombre: 'Pronto Senza Cacao', cantidad: 2, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 4, unidad: 'L' },
  ]},
  { nombre: 'Chocolate Vegano', base_nombre: 'Chocolate Vegano', litros_base: 120, ingredientes: [
    { nombre: 'Chocolate Black', cantidad: 3, unidad: 'kg' },
    { nombre: 'Agua', cantidad: 3, unidad: 'L' },
  ]},
]

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function ok(label, data) {
  console.log(`  ✅ ${label}`)
  return data
}

function fail(label, error) {
  console.error(`  ❌ ${label}: ${error.message}`)
  process.exit(1)
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🧹 Limpiando tablas de ingredientes...')

  const { error: e1 } = await supabase.from('sabor_ingredientes').delete().neq('id', 0)
  if (e1) fail('DELETE sabor_ingredientes', e1)
  ok('sabor_ingredientes vaciada')

  const { error: e2 } = await supabase.from('base_ingredientes').delete().neq('id', 0)
  if (e2) fail('DELETE base_ingredientes', e2)
  ok('base_ingredientes vaciada')

  // ── BASES ──────────────────────────────────────────────────────────────────
  console.log(`\n🍦 Procesando ${basesData.length} bases...`)
  let basesActualizadas = 0
  let basesInsertadas = 0
  let baseIngredientesTotal = 0

  for (const base of basesData) {
    const { data: existing } = await supabase
      .from('bases')
      .select('id')
      .ilike('nombre', base.nombre)
      .maybeSingle()

    let baseId

    if (existing) {
      const { error } = await supabase
        .from('bases')
        .update({ litros_batch: base.litros_batch })
        .eq('id', existing.id)
      if (error) fail(`UPDATE base "${base.nombre}"`, error)
      baseId = existing.id
      basesActualizadas++
    } else {
      const { data, error } = await supabase
        .from('bases')
        .insert({ nombre: base.nombre, litros_batch: base.litros_batch })
        .select('id')
        .single()
      if (error) fail(`INSERT base "${base.nombre}"`, error)
      baseId = data.id
      basesInsertadas++
    }

    if (base.ingredientes.length > 0) {
      const rows = base.ingredientes.map(ing => ({
        base_id: baseId,
        insumo_nombre: ing.nombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
      }))
      const { error } = await supabase.from('base_ingredientes').insert(rows)
      if (error) fail(`INSERT ingredientes base "${base.nombre}"`, error)
      baseIngredientesTotal += rows.length
    }

    console.log(`  ✅ ${base.nombre} (${base.litros_batch}L, ${base.ingredientes.length} ing.)`)
  }

  // ── SABORES ────────────────────────────────────────────────────────────────
  console.log(`\n🍨 Procesando ${saboresData.length} sabores...`)
  let saboresActualizados = 0
  let saboresInsertados = 0
  let saborIngredientesTotal = 0

  for (const sabor of saboresData) {
    const { data: existing } = await supabase
      .from('sabores')
      .select('id')
      .ilike('nombre', sabor.nombre)
      .maybeSingle()

    let saborId

    if (existing) {
      const { error } = await supabase
        .from('sabores')
        .update({ base_nombre: sabor.base_nombre, litros_base: sabor.litros_base })
        .eq('id', existing.id)
      if (error) fail(`UPDATE sabor "${sabor.nombre}"`, error)
      saborId = existing.id
      saboresActualizados++
    } else {
      const { data, error } = await supabase
        .from('sabores')
        .insert({ nombre: sabor.nombre, base_nombre: sabor.base_nombre, litros_base: sabor.litros_base })
        .select('id')
        .single()
      if (error) fail(`INSERT sabor "${sabor.nombre}"`, error)
      saborId = data.id
      saboresInsertados++
    }

    if (sabor.ingredientes.length > 0) {
      const rows = sabor.ingredientes.map(ing => ({
        sabor_id: saborId,
        insumo_nombre: ing.nombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
      }))
      const { error } = await supabase.from('sabor_ingredientes').insert(rows)
      if (error) fail(`INSERT ingredientes sabor "${sabor.nombre}"`, error)
      saborIngredientesTotal += rows.length
    }

    console.log(`  ✅ ${sabor.nombre} → base: ${sabor.base_nombre} (${sabor.ingredientes.length} ing.)`)
  }

  // ── RESUMEN ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50))
  console.log('📊 RESUMEN')
  console.log('─'.repeat(50))
  console.log(`Bases:    ${basesActualizadas} actualizadas, ${basesInsertadas} nuevas`)
  console.log(`Sabores:  ${saboresActualizados} actualizados, ${saboresInsertados} nuevos`)
  console.log(`Ingredientes base:   ${baseIngredientesTotal} insertados`)
  console.log(`Ingredientes sabor:  ${saborIngredientesTotal} insertados`)
  console.log(`Total ingredientes:  ${baseIngredientesTotal + saborIngredientesTotal}`)
  console.log('─'.repeat(50))
  console.log('✅ Seed completado\n')
}

seed()
