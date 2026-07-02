# Informe de Cheques

App **independiente** para controlar cheques **a cobrar** (de terceros) y **a pagar**
(propios), con alertas de vencimiento. Está inspirada en el informe de cheques de
la planilla, pero acá **cargás y editás todo desde la app** —no depende de ninguna
Google Sheet ni de un servidor— y funciona en **computadora, Android, iPhone y
Windows**.

No forma parte del sistema Del Parque: es una aplicación aparte, en su propia
carpeta, que se puede publicar y usar por separado.

## Qué hace

- **Dashboard** — Total a cobrar / a pagar, vencimientos por período (cobrados,
  pendientes, rechazados, vencidos), gráfico de los próximos 30 días y
  **disponibilidad bancaria** (saldo + acuerdo = disponible).
- **Cheques** — alta/edición/baja de cada cheque con banco, número, importe,
  fechas de emisión y de pago/cobro, formato (físico o **e-cheq**), estado, CUIT
  del librador, concepto y observaciones. Exporta a **CSV**.
- **Semanal** — cheques abiertos agrupados por semana de vencimiento.
- **Análisis** — montos por banco, por estado, por razón social y físico vs e-cheq.
- **Varias razones sociales** — cargás todas tus empresas y filtrás por cada una.
- **Alertas y notificaciones** — badge de "por vencer", panel de próximos
  vencimientos y **notificaciones del navegador** cuando hay cheques por vencer
  (configurable: avisar dentro de 3 a 30 días).
- **Exportar** — imagen PNG del panel, PDF (imprimir/guardar) y CSV.
- **Copia de seguridad** — descargás un archivo JSON con todos los datos y lo
  restaurás en otro dispositivo (así pasás la info de la compu al celular).

## Dónde se guardan los datos

En el **propio dispositivo** (almacenamiento local del navegador). Ventaja: no
necesita servidor, funciona sin conexión y es 100% tuyo. Para tener los mismos
datos en la compu y en el celular, usá **Config → Copia de seguridad**
(Descargar copia / Restaurar copia).

> ¿Querés que los datos se sincronicen solos entre todos los dispositivos? Se
> puede sumar un backend (por ejemplo Supabase) en una segunda etapa sin cambiar
> la interfaz.

## Cómo usarla

1. Abrí `index.html`. Si la publicás (ver abajo), entrá desde la URL.
2. En **Config**, cargá una o varias **razones sociales** y tus **cuentas
   bancarias**.
3. Tocá el botón **+** para cargar cheques.
4. Activá las **notificaciones** desde el botón *Alertas* o en Config.
5. **Instalala** en el teléfono/PC: en el navegador, "Agregar a pantalla de
   inicio" / "Instalar app". Queda como una app más, con ícono propio y offline.

## Publicarla (GitHub Pages)

Es una app estática (HTML/CSS/JS, sin build). Para publicarla:

1. Subí la carpeta `cheques-app/` al repositorio.
2. En GitHub → **Settings → Pages**, elegí la rama y la carpeta `/cheques-app`
   (o moviendo el contenido a la raíz de un repo/rama de Pages).
3. La app queda en `https://<usuario>.github.io/<repo>/cheques-app/`.

También podés abrirla localmente con cualquier servidor estático:

```bash
cd cheques-app
python3 -m http.server 8080
# luego abrí http://localhost:8080
```

## Notas sobre notificaciones

- Las **notificaciones del navegador** aparecen cuando la app está abierta (o en
  segundo plano con la pestaña viva). Es lo que soportan por igual todas las
  plataformas sin infraestructura extra.
- Para que lleguen con la app **totalmente cerrada** hace falta *push* real
  (servidor + claves VAPID) y, en iPhone, tener la PWA **instalada**. Queda como
  posible segunda etapa.
- En iOS, las notificaciones web solo funcionan si la app fue **instalada** en la
  pantalla de inicio (requisito de Apple).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Toda la app (interfaz + lógica), en un solo archivo. |
| `manifest.json` | Metadatos de PWA (nombre, íconos, colores). |
| `sw.js` | Service worker: la hace instalable y usable sin conexión. |
| `icon.svg` / `icon-*.png` | Íconos de la app. |
