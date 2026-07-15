import { crearCosteador } from './src/lib/costeoRecetas.js'
const ctx = {
  insumos: [{nombre:'Azúcar', costo_unitario:800}, {nombre:'Estabilizante', costo_unitario:5000}, {nombre:'Agua', costo_unitario:0}],
  bases: [{id:1, nombre:'Base Neutra Agua', litros_batch:120}],
  baseIngredientes: [
    {base_id:1, insumo_nombre:'Azúcar', cantidad:30, unidad:'kg'},
    {base_id:1, insumo_nombre:'Estabilizante', cantidad:1, unidad:'kg'},
    {base_id:1, insumo_nombre:'Agua', cantidad:90, unidad:'L'},
  ],
  sabores: [], saborIngredientes: [],
}
const c = crearCosteador(ctx)
console.log('costoDe("Base Neutra Agua") $/L =', c.costoDe('Base Neutra Agua').toFixed(2), '(antes daba 0)')
console.log('costoDe("Agua") =', c.costoDe('Agua'), '(agua de red sigue gratis)')
console.log('tipoDe("Base Neutra Agua") =', c.tipoDe('Base Neutra Agua'))
