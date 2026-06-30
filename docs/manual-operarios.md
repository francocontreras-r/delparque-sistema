# Manual de Procedimientos — Operarios

**Helados del Parque S.A.S.** · Sistema de Producción Del Parque
Versión 1.0 · Junio 2026

---

## 0. Introducción y alcance

Este manual describe, paso a paso, **todas las operaciones de carga** que realizan los operarios en el sistema Del Parque. Está pensado para que cualquier persona que ingrese datos —producción, movimientos de cámara, egresos de depósito, conteos— sepa exactamente **qué botón tocar, qué campo completar y qué pasa después**.

Reglas de lectura:
- Los **nombres entre comillas** ("Confirmar y registrar todo") son textos que vas a ver tal cual en la pantalla.
- Un campo con **asterisco (\*)** es **obligatorio**: el sistema no te deja continuar sin completarlo.
- Los recuadros **⚠ Importante** marcan controles que no se pueden saltear.

---

## 1. Conceptos clave (leé esto primero)

| Término | Qué es |
|---|---|
| **Balde** | Unidad física en que se guarda el helado en cámara. |
| **Base** | Mezcla intermedia (crema) que se elabora primero y con la que después se hacen los sabores. |
| **Sabor** | Helado terminado, hecho a partir de una base + saborizantes. Se mide en **kg**. |
| **Impulsivo / Postre** | Productos que se miden en **unidades** (palitos, bombones, tortas, barras). |
| **Etapa** | Cada paso del proceso de un postre (moldeado, abatidor, desmolde, baño, decoración). |
| **Abatidor / Cámara** | Etapa de **espera**: el producto enfría solo. **No cuenta como tiempo de trabajo del operario.** |
| **Rindió** | Cuánto producto terminado salió de un balde que se entregó a producción. |
| **Merma** | Pérdida de producto (faltante, rotura, vencimiento). Siempre queda registrada. |
| **Lote** | Identificación de una tanda de producto, para trazabilidad. |
| **Conteo físico** | Contar lo que hay realmente y compararlo con lo que dice el sistema. |
| **Orden de producción** | El documento que ordena hacer un producto (con su cantidad y operario). |

---

## 2. Ingreso al sistema

1. Abrí la página del sistema en el navegador.
2. Ingresá tu **correo** (ej. `usuario@delparque.com`) y tu **Contraseña**.
3. Tocá **"Ingresar"**.

**Cosas a saber:**
- Si no tocás nada durante **2 horas**, el sistema te cierra la sesión solo, por seguridad.
- Podés cerrar cualquier ventana emergente con la tecla **ESC**.
- Para **cerrar el sistema**, la tecla **ESC** (en la pantalla principal) te pide confirmación antes de salir.

**¿Qué módulos veo?** Depende de tu rol:

| Rol | Módulos que ve |
|---|---|
| **Operario** | Inicio · Producción · Cámaras · Rendimiento |
| **Supervisor** | Lo anterior + Órdenes · Depósito · Mermas · Recetas · Informes |
| **Administrador** | Todo, incluido Finanzas, Usuarios y Bitácora |

Si te falta un módulo que necesitás, pedíselo a tu supervisor: es un tema de permisos.

---

## 3. Las 6 reglas de oro

Estas reglas son la base de que los números del sistema sean confiables. **No se saltean.**

1. **Siempre elegí el operario.** En todo egreso o movimiento, el sistema pide quién lo hizo. No es opcional.
2. **Cargá cuánto rindió cada balde** que entregás a producción. Sin eso, no se sabe si el balde rindió lo que tenía que rendir.
3. **No se cierra un sabor sin su base.** Si la base no figura en stock, registrala en el momento de cerrar la orden.
4. **Los faltantes de un conteo van a Mermas.** No se ocultan ni se pisan en silencio.
5. **Todo lo que sale del depósito tiene destino y quién lo retira.** Para saber a dónde se fue la mercadería.
6. **No saltees la orden de base.** Si hiciste una base, cargala (aunque sea después): así queda registrado el tiempo y los materiales que usaste.

---

## 4. Módulo PRODUCCIÓN

Acá se carga **lo que se produjo** y entra a cámara. Hay dos formas: por **lector de código** o **manual**.

### 4.1 Cargar producción con el lector (código de barra)

> **⚠ Importante:** Antes de escanear, **seleccioná tu nombre** en el desplegable **"Operario \*"**. Si no, al escanear vas a ver el aviso *"Seleccioná un operario antes de escanear"*.

1. Elegí tu nombre en **"Operario \*"**.
2. Hacé clic en el campo **"Escanear código de barra…"**.
3. Pasá el producto por el lector. Cada lectura agrega **1 balde/unidad** con su peso a la lista de **PRE-CARGA**.
4. Repetí con todos los productos. Vas a ver la tabla de pre-carga con: **Lote · Operario · Producto · Cantidad · Observaciones**.
5. Si te equivocaste en una fila, usá el botón de **quitar** (✕) de esa fila.
6. Cuando terminaste, tocá **"Confirmar y registrar todo (N ítems)"**.

**Qué hace al confirmar:** registra la producción, suma el producto a **Cámaras**, deja el movimiento registrado y, si hay una orden en curso de ese producto, la vincula automáticamente. Vas a ver un mensaje tipo *"✅ N registro(s) guardado(s)…"*.

### 4.2 Cargar producción manual (sin lector)

1. Elegí tu nombre en **"Operario \*"**.
2. Tocá **"Carga manual"**.
3. Completá:
   - **"Producto \*"** — elegilo de la lista (agrupada en **Helados**, **Impulsivos**, **Postres**).
   - **"Cantidad (baldes) \*"** o **"Cantidad (unidades) \*"** según el producto.
   - **"Peso total (kg) \*"** — para helados y postres.
   - **"Lote"** — viene precompletado con el lote de hoy; cambialo si hace falta.
   - **"Observaciones"** — opcional.
4. Tocá **"＋ Agregar a lista"**. El ítem aparece en la pre-carga.
5. Repetí para más productos y cerrá con **"Confirmar y registrar todo (N ítems)"**.

### 4.3 Gestionar operarios

1. Tocá el ícono de **engranaje** al lado del desplegable de operario. Se abre **"Gestionar Operarios"**.
2. **Agregar:** escribí el **"Nombre completo…"** y tocá el botón **＋**.
3. **Eliminar:** tocá la **✕** en la fila del operario (queda inactivo, no se borra el historial).

> El **"¿Cuánto rindió?"** de un balde **no se carga acá** — se carga en **Cámaras** (ver punto 6.1).

---

## 5. Módulo ÓRDENES

Acá se planifica qué producir, se inicia y se finaliza. *(Rol supervisor o superior.)*

### 5.1 Crear una orden nueva

1. Tocá **"＋ Nueva orden"**.
2. Elegí la pestaña del tipo: **BASES · SABORES · IMPULSIVOS · POSTRES**.
3. Seleccioná el **Producto**, poné la **"Cantidad \*"** y las **"Horas estimadas \*"**.
4. Tocá **"Agregar a lista"**. Podés sumar varias líneas.
5. Completá la **"Fecha de producción"**, el **operario** y las **observaciones** (opcional).
6. Tocá **"Crear orden"**.

> Para helados, al crear se verifica el **stock de insumos**. Si falta algo crítico, el sistema te avisa con la lista.

### 5.2 Iniciar la producción de una orden

1. En la orden, tocá **"Iniciar producción"**.
2. El sistema revisa el stock de insumos. Si falta algo, te muestra qué falta; podés **confirmar igualmente** si decidís seguir.
3. Confirmá la **fecha y hora** de inicio (viene con la hora actual).

La orden pasa a **"En proceso"**.

### 5.3 Registrar las etapas de un postre

Los postres llevan varias etapas (moldeado → abatidor → desmolde → baño → decoración). Se cargan desde el **detalle de la orden**.

1. Abrí el **detalle** de la orden de postre.
2. En **"Etapas de proceso"**, para cada etapa:
   - Elegí el **operario** que la hace.
   - Tocá **"▸ Iniciar"** cuando empieza.
   - Tocá **"Finalizar"** cuando termina.
3. El **Abatidor / Cámara** es una etapa de **espera**: marca el tiempo de proceso pero **no se le suma como trabajo a nadie**.

> Distintos operarios pueden hacer distintas etapas del mismo lote: **cada uno se lleva el crédito de la suya.**

### 5.4 Finalizar una orden

1. En la orden (o su detalle), tocá **"Finalizar orden"**.
2. Confirmá la **fecha y hora de finalización**.

> **⚠ Control de base (sabores):** si el sabor usa una base que **no figura en stock**, el sistema te pide **registrar la base que se usó** antes de cerrar:
> - **"Kg de base que se usaron"**
> - **"Fecha en que se hizo la base"** (si es de un día anterior, queda marcada **retroactiva**)
> - **operario** que la hizo
>
> Esto **no frena el escaneo** ni la producción: solo se exige al **cerrar** la orden. Así la base deja de quedar "colgada".

3. Tocá **"Confirmar y finalizar"**.

### 5.5 Reconciliar bases *(supervisor)*

El botón **"Reconciliar bases"** abre una vista que muestra, por base: cuánto se produjo, cuánto se consumió en sabores, y si **rindió** lo que tenía que rendir. Sirve para detectar bases "colgadas" o rinde bajo.

---

## 6. Módulo CÁMARAS

Acá se registra todo lo que **entra y sale** de las cámaras de frío, y se hacen los **conteos físicos**.

### 6.1 Registrar un movimiento (ingreso o egreso)

1. En la grilla, **hacé clic en la tarjeta** del producto.
2. Elegí **"↑ Ingreso"** o **"↓ Egreso"**.
3. Completá según el caso:

**Si es INGRESO:**
- **"Cantidad \*"** (baldes/unidades) y, si corresponde, **peso (kg)**.
- **"Lote \*"**.
- **"Motivo \*"**: Producción · Ajuste de inventario · Transferencia · Devolución.
- Si el motivo es **Producción** → **"Operario que elaboró \*"**.

**Si es EGRESO:**
- **"Cantidad \*"** (baldes/unidades) y, si corresponde, peso.
- **"Motivo \*"**: Venta · Baja · Merma · Transferencia · Ajuste de inventario · Producción.
- **"Operario que retira \*"** — **obligatorio siempre.**
- Si el motivo es **Producción**:
  - **"Producto elaborado \*"** — qué se va a hacer con ese balde.
  - **"¿Cuánto rindió? \*"** — unidades/kg que se obtuvieron. El sistema muestra el rendimiento por balde.
4. Tocá **"Confirmar"**.

> **⚠ Regla:** un egreso **siempre** lleva operario. Y si va a **producción**, **siempre** se carga cuánto rindió. Ese dato es el que permite controlar las diferencias.

### 6.2 Conteo físico de cámara

1. Tocá **"Conteo físico"**.
2. (Opcional) Elegí el **"Operario que cuenta"**.
3. Para cada producto, escribí en la columna **"Físico"** la cantidad **real** que contaste.
4. El sistema calcula solo la **diferencia** contra lo que tiene registrado.
5. Tocá **"Ajustar (N cambios)"**.

> **⚠ Importante:** los **faltantes** (lo que falta respecto al sistema) se registran **automáticamente en Mermas**, valorizados, con la causa *"Faltante de conteo"*. No desaparecen.

---

## 7. Módulo DEPÓSITO

Acá se cargan las **materias primas y mercadería**: lo que entra (compras, sobrantes) y lo que sale (a producción, venta, uso interno). *(Rol supervisor o superior.)*

### 7.1 Registrar un ingreso de mercadería

1. Tocá **"↑ Registrar Ingreso"**.
2. Completá:
   - **"Fecha \*"**, **"Producto \*"**, **"Marca \*"**, **"Presentación \*"** (Balde, Bolsa, Caja, etc.).
   - **"Cantidad \*"** + **"Unidad \*"** (u / kg / L).
   - **"N° de Lote \*"** y **"Vencimiento \*"**.
   - **"Controló \*"** (operario) y **"Proveedor \*"**.
   - **"Tipo de ingreso \*"**: Compra a proveedor · Sobrante de producción · Devolución · Ajuste · Transferencia.
   - Opcionales: peso por unidad, N° remito, precio unitario, observaciones.
3. Revisá la **pantalla de resumen** y tocá **"✓ Confirmar registro"**.

### 7.2 Registrar un egreso

1. Tocá **"↓ Registrar Egreso"**.
2. Completá producto, cantidad, unidad, lote y **"Controló \*"**.
3. **"Motivo \*"** (depende del tipo de insumo): Uso en producción · Venta · Merma · Vencimiento · Devolución · Ajuste · Baja.
4. **"Destino \*"**: Bases · Sabores · Postres · Impulsivos · Escocés · Bombones · Panadería · Uso interno · Venta · Otro.
5. **"Retira / Solicita \*"** — **obligatorio:** quién se lleva la mercadería.
6. Confirmá.

> **⚠ Regla:** elegí bien el **Destino**. Si usás **"Otro"**, sabé que el sistema lo marca como egreso a revisar (no tiene un destino productivo claro).

### 7.3 Conteo semanal (Control Semanal)

1. Andá a la pestaña **"Control Semanal"**.
2. Tocá **"Iniciar conteo"**.
3. Para cada insumo, cargá la cantidad **física real** que contaste.
4. Tocá **"Guardar conteo"**.
5. En **"Aprobar conteo"**, por cada **diferencia** entre sistema y físico, elegí un **motivo obligatorio**:
   - Error de conteo anterior · Merma no registrada · Ingreso no registrado · Egreso no registrado · Vencimiento y descarte · Rotura o derrame · Ajuste de inventario.
6. Tocá **"Confirmar y aprobar"**.

> No se puede aprobar dejando una diferencia **sin motivo**: así toda corrección queda justificada.

---

## 8. Procedimientos completos (de punta a punta)

### A. Producir un sabor de helado
1. **Órdenes** → "Nueva orden" → pestaña SABORES → producto, cantidad, horas → "Crear orden".
2. **Órdenes** → "Iniciar producción" (revisa stock).
3. **Producción** → cargá lo producido (lector o manual) con tu operario y los kg.
4. **Órdenes** → "Finalizar orden". Si la base no está en stock, **registrá la base usada** y confirmá.

### B. Producir un postre
1. **Órdenes** → "Nueva orden" → pestaña POSTRES → producto, unidades → "Crear orden".
2. **Órdenes** → "Iniciar producción".
3. **Órdenes** → detalle → **Etapas**: iniciá/finalizá cada etapa con su operario (el abatidor es espera).
4. **Órdenes** → "Finalizar orden".

### C. Entregar un balde a producción
1. **Cámaras** → clic en la tarjeta del producto → "↓ Egreso".
2. Motivo **"Producción"** → operario que retira → **Producto elaborado** → **¿Cuánto rindió?** → "Confirmar".

### D. Sacar mercadería para venta
1. **Cámaras** → tarjeta → "↓ Egreso" → Motivo **"Venta"** → operario que retira → "Confirmar".

### E. Conteo semanal de stock
1. **Cámaras** → "Conteo físico" (faltantes → Mermas). 
2. **Depósito** → "Control Semanal" → Iniciar → cargar físico → Guardar → Aprobar con motivos.

---

## 9. Errores frecuentes y cómo resolverlos

| Mensaje / Situación | Qué significa | Solución |
|---|---|---|
| *"Seleccioná un operario antes de escanear"* | No elegiste tu nombre. | Elegí el operario arriba y volvé a escanear. |
| *No se puede cerrar sin registrar la base usada* | El sabor usa una base que no está en stock. | Cargá la base usada (kg, fecha, operario) en el mismo modal de finalización. |
| *Stock insuficiente* al iniciar una orden | Faltan insumos en depósito. | Revisá el depósito; si igual vas a producir, "Confirmar igualmente". |
| Ingrediente marcado **"Sin precio"** en Recetas | Ese insumo no está vinculado al depósito. | Avisá al supervisor para vincular el insumo (su costo se cuenta como $0 hasta entonces). |
| Un sabor figura con base "colgada" en Reconciliar bases | Se hizo el sabor sin descontar la base. | A futuro, al cerrar el sabor registrá la base. Para lo viejo, revisalo con el supervisor. |
| La sesión se cerró sola | Pasaron 2 horas sin actividad. | Volvé a ingresar; lo cargado quedó guardado. |

---

## 10. Glosario rápido

- **Batch:** una tanda de elaboración de una base o sabor.
- **Lead time / ciclo:** tiempo total desde que empieza hasta que termina un lote (puede abarcar días). No es el tiempo de trabajo del operario.
- **Retroactiva (base):** base cargada con fecha anterior a hoy. Se marca como tal y su tiempo no cuenta para la eficiencia.
- **Pre-carga:** lista temporal de lo escaneado/cargado que todavía no se confirmó.
- **Conciliada (base):** base cuyo consumo cuadra con el helado producido.

---

*Documento interno de uso confidencial — Helados del Parque S.A.S.*
