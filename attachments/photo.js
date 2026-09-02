// ==========================================================================
// Photo capture and client-side compression for habit check-ins.
// ==========================================================================

function readAndCompressImage(file, maxDim = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function pickPhoto() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) {
        reject(new Error("cancelled"));
        return;
      }
      try {
        const dataUrl = await readAndCompressImage(file);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };

    input.click();
  });
}

module.exports = { readAndCompressImage, pickPhoto };
