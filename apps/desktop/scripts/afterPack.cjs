"use strict";

module.exports = async function afterPack(context) {
  const { adHocSignAfterPack } = await import("electron-sparkle-updater/builder");
  return adHocSignAfterPack(context);
};
