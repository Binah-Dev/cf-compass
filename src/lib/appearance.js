const CUSTOM_WALLPAPER_KEY = "cf-compass-custom-wallpaper-v1";

function chooseBrowserImage() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) {
          resolve({ canceled: true });
          return;
        }
        if (file.size > 15 * 1024 * 1024) {
          throw new Error("图片不能超过 15 MB");
        }
        const reader = new FileReader();
        reader.onload = () => {
          const result = { canceled: false, dataUrl: reader.result, name: file.name };
          localStorage.setItem(CUSTOM_WALLPAPER_KEY, JSON.stringify(result));
          resolve(result);
        };
        reader.onerror = () => reject(new Error("无法读取这张图片"));
        reader.readAsDataURL(file);
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

export async function loadCustomWallpaper() {
  if (window.cfBridge?.getCustomWallpaper) {
    return window.cfBridge.getCustomWallpaper();
  }
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_WALLPAPER_KEY) || "null");
  } catch {
    return null;
  }
}

export async function chooseCustomWallpaper() {
  if (window.cfBridge?.chooseCustomWallpaper) {
    return window.cfBridge.chooseCustomWallpaper();
  }
  return chooseBrowserImage();
}

export async function clearCustomWallpaper() {
  if (window.cfBridge?.clearCustomWallpaper) {
    return window.cfBridge.clearCustomWallpaper();
  }
  localStorage.removeItem(CUSTOM_WALLPAPER_KEY);
  return { cleared: true };
}
