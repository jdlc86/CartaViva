export function createLatestReadTaskController() {
  let revision = 0;
  let activeController = null;

  const cancel = () => {
    revision += 1;
    activeController?.abort();
    activeController = null;
  };

  return Object.freeze({
    start() {
      cancel();
      const controller = new AbortController();
      const taskRevision = revision;
      let finished = false;
      activeController = controller;

      return Object.freeze({
        signal: controller.signal,
        isCurrent() {
          return !finished &&
            activeController === controller &&
            revision === taskRevision &&
            !controller.signal.aborted;
        },
        finish() {
          if (finished) return;
          finished = true;
          if (activeController === controller) activeController = null;
        },
      });
    },
    cancel,
  });
}
