type ContextMenuParams = {
  isEditable: boolean;
  selectionText: string;
  mediaType: string;
  linkURL: string;
};

export function shouldShowDefaultMenu(
  _event: unknown,
  params: ContextMenuParams,
): boolean {
  if (params.isEditable) return true;
  if (params.selectionText.trim().length > 0) return true;
  if (params.mediaType === "image" || params.mediaType === "video") return true;
  if (params.linkURL) return true;
  return false;
}

export async function installDefaultContextMenu(): Promise<() => void> {
  const { default: contextMenu } = await import("electron-context-menu");
  const isDev = process.env.ELECTRON_DEV === "1";

  return contextMenu({
    showSearchWithGoogle: false,
    showLookUpSelection: true,
    showLearnSpelling: true,
    showCopyImage: true,
    showCopyLink: true,
    showInspectElement: isDev,
    shouldShowMenu: shouldShowDefaultMenu,
    labels: {
      cut: "剪切",
      copy: "复制",
      paste: "粘贴",
      selectAll: "全选",
      copyLink: "复制链接",
      copyImage: "复制图片",
      copyImageAddress: "复制图片地址",
      saveImage: "保存图片",
      saveImageAs: "图片存储为…",
      lookUpSelection: "查询“{selection}”",
      learnSpelling: "学习拼写“{selection}”",
      inspect: "检查元素",
      services: "服务",
    },
  });
}
