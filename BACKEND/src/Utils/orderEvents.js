import { EventEmitter } from "node:events";

// In-process pub/sub for order changes. Drives the store SSE stream so
// clients get pushed updates instead of polling.
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function emitOrderUpdate(order) {
  if (!order || !order.storeId) return;
  bus.emit(`store:${String(order.storeId)}`, order);
}

export function onStoreOrderUpdate(storeId, handler) {
  const channel = `store:${String(storeId)}`;
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}
