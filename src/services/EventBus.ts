/**
 * EventBus — Sistema pub/sub tipado para arquitectura dirigida por eventos.
 *
 * Permite que cualquier parte de la app emita eventos sin conocer quién los
 * consume, desacoplando la lógica de negocio de la orquestación de notificaciones.
 *
 * Patrón: Singleton para garantizar un único bus de eventos en toda la app.
 */

type EventHandler<T = unknown> = (payload: T) => void;

class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  /** Suscribe un handler a un tipo de evento. Retorna función de desuscripción. */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event)!;
    handlers.add(handler as EventHandler);

    return () => {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /** Emite un evento a todos los handlers suscritos. */
  emit<T = unknown>(event: string, payload: T): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error en handler para "${event}":`, err);
      }
    }
  }

  /** Elimina todas las suscripciones (útil para cleanup en tests/hot-reload). */
  clear(): void {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
