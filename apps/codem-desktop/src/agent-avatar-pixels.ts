// Recolor background tones from the original Figma raster export, including
// background areas enclosed by accessories such as Sheriff's headphones.
// The face and accessories retain their original pixels and shading.
export function recolorAvatarBackground(pixels: Uint8ClampedArray, width: number, height: number, color: string, backgroundOnly = false) {
  const result = new Uint8ClampedArray(pixels);
  if (!/^#[\da-f]{6}$/i.test(color) || width < 1 || height < 1 || pixels.length !== width * height * 4) return result;
  const target = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16));
  const seed = Math.floor(height * .1) * width + Math.floor(width / 2);
  const source = Array.from(pixels.slice(seed * 4, seed * 4 + 3));
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const distance = source.reduce((total, channel, i) => total + (pixels[offset + i] - channel) ** 2, 0);
    if (pixels[offset + 3] === 0 || distance > 70 ** 2) {
      if (backgroundOnly) result[offset + 3] = 0;
      continue;
    }
    for (let channel = 0; channel < 3; channel++) result[offset + channel] = target[channel] + pixels[offset + channel] - source[channel];
  }
  return result;
}
