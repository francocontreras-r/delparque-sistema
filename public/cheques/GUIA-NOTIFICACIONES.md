# 📲 Cómo dejar andando los avisos automáticos (push + email)

Con esto, la app te avisa **sola** cuando un cheque está por vencer, **aunque la
tengas cerrada** — como un mensaje de WhatsApp. Avisa en **hitos** (no todos los
días): cuando el cheque entra en la ventana que elegís, cuando faltan **2 días**
y el **día del vencimiento**.

Son 3 pasos. Hacelos una sola vez.

---

## Paso 1 · Crear las tablas en Supabase

1. Entrá a **supabase.com** → tu proyecto de Cheques.
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Copiá y pegá TODO el contenido del archivo **`notificaciones.sql`** (está en
   esta misma carpeta) y tocá **Run**.
4. Tiene que decir *Success*. Listo.

---

## Paso 2 · Cargar las variables en Vercel

1. Entrá a **vercel.com** → proyecto **delparque-sistema** → **Settings** →
   **Environment Variables**.
2. Agregá estas variables (una por una, con **Save**). Dejá marcados
   *Production, Preview y Development*:

| Nombre (KEY) | Valor (VALUE) |
|---|---|
| `VAPID_PUBLIC_KEY` | `BORtCwW6NgiNjqItMVpiUyBPHC6EwGR3jROqK_yT3x2V62RR_v9Gh5XAr5f1M6J6vuCFRBYYFu-ClVitWMaJuZQ` |
| `VAPID_PRIVATE_KEY` | *(la llave privada que te pasé por el chat — es secreta)* |
| `VAPID_SUBJECT` | `mailto:francocontreras.r@gmail.com` |
| `CRON_SECRET` | *(inventá una clave larga cualquiera, ej. 30 letras/números al azar)* |

> `CHEQUES_SERVICE_ROLE_KEY` ya la cargaste antes; no la toques.

3. **(Opcional, para el email)** si querés que además llegue por correo:

| Nombre (KEY) | Valor (VALUE) |
|---|---|
| `RESEND_API_KEY` | *(la API key de tu cuenta de **resend.com**)* |
| `RESEND_FROM` | `CIAF Cheques <avisos@TUDOMINIO.com>` |

Sin `RESEND_API_KEY` el email simplemente no se manda y el push funciona igual.
Para mandar a varios destinatarios, Resend pide **verificar un dominio** (te guío
cuando quieras). Para probar, podés mandarte solo a vos mismo.

4. Después de guardar todo: **Deployments → (el último) → ⋯ → Redeploy**.

---

## Paso 3 · Activarlo en tu celular

1. Abrí la app: **delparque-sistema.vercel.app/cheques/**
2. **En iPhone es obligatorio instalarla primero:** botón **Compartir** →
   **Agregar a pantalla de inicio**. Después abrila desde ese ícono.
3. Iniciá sesión (con tu cuenta de la nube).
4. Andá a **Config** → sección **📲 Aviso automático al celular** →
   **Activar push en este dispositivo** → aceptá el permiso.
5. Tocá **Probar push real**. En unos segundos te llega la notificación. 🎉

Repetí el Paso 3 en cada celular/compu donde quieras recibir el aviso.

**Emails:** en esa misma pantalla (solo el admin lo ve) podés cargar los correos
que reciben el aviso de la mañana.

---

## ¿Cuándo llega?

Todos los días a la **mañana (~8:00, hora Argentina)**, si hay algún cheque que
cruzó un hito ese día. Si no hay nada por vencer, no molesta.

## Si algo no llega

- **iPhone:** ¿instalaste la app en la pantalla de inicio y la abriste desde el
  ícono? Es obligatorio; en el navegador Safari suelto no funciona.
- ¿Corriste el SQL del Paso 1 y redeployaste después de cargar las variables?
- Probá **Config → Probar push real**. Si da error, el texto te dice qué falta.
