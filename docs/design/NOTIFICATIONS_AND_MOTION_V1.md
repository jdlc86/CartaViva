# CartaViva — Contrato visual de notificaciones y movimiento V1

Estado: dirección aprobada para diseño; implementación pendiente. Fecha: 2026-10-18.

## Principios
- Los eventos y resultados proceden del backend; la animación nunca confirma por sí misma una operación.
- No inventar estados, porcentajes ni trazabilidad de platos, comandas o entregas. Mostrar únicamente eventos respaldados por contratos y persistencia reales.
- Consistencia visual: fondo cálido #F8F7F4, verde #146B57, texto #202622, acento cálido #D98B45.
- Tres presentaciones: toast transitorio para acciones rutinarias; bandeja persistente para acontecimientos importantes; diálogo accesible para decisiones y acciones destructivas.
- La reserva enviada está **pendiente** hasta aceptación de cocina; no confundir solicitud de reserva con pedido confirmado.
- Errores de red y operaciones fallidas muestran estados de error, nunca confirmación positiva.
- Las notificaciones importantes permanecen consultables al cambiar de pantalla o reabrir la PWA; el frontend no es su fuente de verdad.
- Evitar mensajes duplicados mediante IDs de evento, reintentos idempotentes y reconciliación con backend. No asumir que las push llegarán.
- Avisos para cocina y camareros se diseñarán conforme a sus permisos y eventos operativos reales.

## Biblioteca propuesta, no instalada
React + TypeScript; Motion for React para presencia y transiciones; primitivas accesibles Radix UI para diálogos; Lucide para iconos. No fijar dependencia ni API de versiones hasta integrar en el proyecto.

## Transiciones orientativas (no métricas obligatorias)
| Componente | Movimiento | Duración |
| --- | --- | --- |
| Toast | opacidad 0→1 y desplazamiento vertical 8px→0 | 180–240 ms |
| Aviso destacado | opacidad 0→1 y escala .98→1 | 200–260 ms |
| Bandeja | entrada/salida y reordenación suave | 180–220 ms |
| Diálogo | overlay atenuado y escala .98→1 | 200–260 ms |
| Contador | escala discreta | 120–180 ms |
| Nueva comanda | resaltado puntual, sin parpadeo continuo | 250–350 ms |

Respetar `prefers-reduced-motion`: suprimir desplazamientos/escalas y usar cambios inmediatos o de opacidad mínimos. Evitar rebotes, confeti, sonidos no solicitados y movimiento permanente. No usar duración como temporizador de negocio.

## Ejemplo A — Toast animado con Motion (ilustrativo)
```tsx
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type Toast = { id: string; message: string; tone: "success" | "error" };
export function ToastRegion({ items }: { items: Toast[] }) {
  const reduced = useReducedMotion();
  return (
    <div role="region" aria-label="Avisos">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }}
            className={`toast toast--${item.tone}`}
          >
            {item.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```
Nota: un gestor de avisos real deberá gestionar temporización, pausa al enfocar/hover, cola, limpieza y anuncios accesibles sin duplicaciones.

## Ejemplo B — Confirmación solo tras respuesta del servidor
```ts
type SaveResult = { ok: true; cartVersion: string } | { ok: false; reason: string };
async function saveCartChange(
  command: unknown,
  save: (value: unknown) => Promise<SaveResult>,
  notify: (notice: { tone: "success" | "error"; message: string }) => void,
) {
  try {
    const result = await save(command);
    if (!result.ok) {
      notify({ tone: "error", message: result.reason });
      return;
    }
    notify({ tone: "success", message: "Selección actualizada" });
  } catch {
    notify({ tone: "error", message: "No se pudo guardar. Inténtalo de nuevo." });
  }
}
```
No confundir un cambio local optimista del carrito con una reserva/pedido aceptado por el servidor.

## Ejemplo C — Confirmación destructiva con Radix Dialog (ilustrativo)
```tsx
import * as Dialog from "@radix-ui/react-dialog";

export function RemoveDishDialog({ onConfirm }: { onConfirm: () => Promise<void> }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger>Eliminar plato</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>¿Eliminar este plato?</Dialog.Title>
          <Dialog.Description>
            Se eliminará de la selección todavía no confirmada.
          </Dialog.Description>
          <Dialog.Close>Cancelar</Dialog.Close>
          <button type="button" onClick={() => void onConfirm()}>
            Confirmar eliminación
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```
En producción: deshabilitar doble envío mientras esté pendiente, gestionar fallo, mantener abierto si falla, restaurar foco y asegurar teclado/lectores de pantalla. El ejemplo no implementa esos controles.

## Pendientes antes de desarrollo
1. Contratos de eventos y permisos para cliente, cocina y camarero; nombres de estado de dominio validados.
2. API, almacenamiento, lectura/no leído, retención y deduplicación de notificaciones.
3. Canal en tiempo real y reconexión, sincronización y comportamiento offline; push solo si se aprueba explícitamente.
4. Criterios de prioridad, sonidos opcionales, accesibilidad y pruebas E2E.
