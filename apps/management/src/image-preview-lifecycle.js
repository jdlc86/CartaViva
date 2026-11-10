export function createImagePreviewController(urlApi = URL) {
  let currentUrl = '';

  const release = () => {
    if (!currentUrl) return;
    urlApi.revokeObjectURL(currentUrl);
    currentUrl = '';
  };

  return {
    replace(file) {
      release();
      if (!file) return '';
      currentUrl = urlApi.createObjectURL(file);
      return currentUrl;
    },
    clear: release,
    dispose: release,
  };
}
