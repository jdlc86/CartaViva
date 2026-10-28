// Session replacement fence independent of React and the identity provider.
// A stale host disposer must not close a newer employee's channel.
export function createManagementSessionFence() {
  let active = null;
  let generation = 0;
  return Object.freeze({
    replace(gateway) {
      if (!gateway || typeof gateway.revoke !== 'function') {
        throw Error('invalid_management_session_gateway');
      }
      active?.gateway.revoke();
      const entry = {gateway, generation: ++generation};
      active = entry;
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        gateway.revoke();
        if (active === entry) {
          active = null;
          generation++;
        }
      };
    },
    isCurrent(gateway) {
      return active?.gateway === gateway;
    },
    revoke() {
      if (!active) return;
      const entry = active;
      active = null;
      generation++;
      entry.gateway.revoke();
    },
  });
}
