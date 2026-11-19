// Positions on the 480 x 480 round screen, shared by the watch face and the image renderer.
export const LAYOUT = {
  cx: 240, cy: 250, // centre of the Earth / scene
  earthR: 60, earthImg: 180, // globe radius, and the image size including the axis
  orbitRx: 168, orbitRy: 50, // the Moon's orbit as drawn
  moonImg: 36,
  sunX: -46, sunR: 104,
  timeY: 44, digitW: 46, digitH: 80, colonW: 20, digitSize: 78,
  dateY: 128,
  lineY: [342, 376, 410], lineH: 32,
  textImgY: 336, textImgH: 44, // Moon line images: taller than a text line, room for stacked Thai marks
};
