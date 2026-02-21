chrome.runtime.onInstalled.addListener(() => {
  // Service worker remains intentionally minimal; content script handles UI polling.
  console.log("Niblet extension installed.");
});
