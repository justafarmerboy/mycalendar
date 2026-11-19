// ปฏิทินฟ้า watch face: Earth in the middle with its tilted axis, the Sun on the left, and the Moon
// on its orbit showing the phase we see. Updated every minute from the watch's clock.
import { faceState, statsText, EARTH_FRAMES } from '../shared/sky.js';
import { LAYOUT as L } from '../shared/layout.js';
import { TEXT_W } from '../shared/text-images.js';

const img = (name) => `images/${name}`;
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => img(`digits/${d}.png`));
const NORMAL = hmUI.show_level.ONLY_NORMAL;

let minuteTimer = null;

WatchFace({
  build() {
    const time = hmSensor.createSensor(hmSensor.id.TIME);
    const battery = hmSensor.createSensor(hmSensor.id.BATTERY);
    const step = hmSensor.createSensor(hmSensor.id.STEP);
    const heart = hmSensor.createSensor(hmSensor.id.HEART);

    hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: 0, src: img('bg.png'), show_level: NORMAL });
    // two Moon widgets: one drawn before the Earth (behind it) and one after (in front)
    const moonBack = hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: 0, src: img('moon/m00.png'), show_level: NORMAL });
    const earth = hmUI.createWidget(hmUI.widget.IMG, {
      x: L.cx - L.earthImg / 2, y: L.cy - L.earthImg / 2, src: img('earth/e00.png'), show_level: NORMAL,
    });
    const moonFront = hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: 0, src: img('moon/m00.png'), show_level: NORMAL });

    // the time is drawn by the system, so it stays right on the always-on display too
    const timeW = 4 * L.digitW + L.colonW;
    hmUI.createWidget(hmUI.widget.IMG_TIME, {
      hour_zero: 1,
      hour_startX: L.cx - timeW / 2,
      hour_startY: L.timeY,
      hour_array: digits,
      hour_space: 0,
      hour_unit_sc: img('digits/colon.png'),
      hour_unit_tc: img('digits/colon.png'),
      hour_unit_en: img('digits/colon.png'),
      hour_align: hmUI.align.LEFT,
      minute_zero: 1,
      minute_array: digits,
      minute_space: 0,
      minute_follow: 1,
      show_level: hmUI.show_level.ONLY_NORMAL | hmUI.show_level.ONAL_AOD,
    });

    const text = (y, size, color, level = NORMAL) => hmUI.createWidget(hmUI.widget.TEXT, {
      x: 40, y, w: 400, h: L.lineH + 4, color, text_size: size, text: '',
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text_style: hmUI.text_style.ELLIPSIS, show_level: level,
    });
    const dateText = text(L.dateY, 28, 0xcfd6e4, hmUI.show_level.ONLY_NORMAL | hmUI.show_level.ONAL_AOD);
    // the Moon line is drawn from images: the watch font loses tone marks over upper vowels (ขึ้น, ค่ำ)
    const lunarImg = hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: L.textImgY, src: img('lunar/w01.png'), show_level: NORMAL });
    const phaseImg = hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: L.textImgY, src: img('phase/p0.png'), show_level: NORMAL });
    const seasonText = text(L.lineY[1], 26, 0xf5b942);
    const statsLine = text(L.lineY[2], 24, 0x8f9bb5);

    const update = () => {
      const utc = time.utc;
      // local minus UTC, from the sensor's local fields, rounded to whole minutes
      const localMs = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
      const offset = Math.round((localMs - utc) / 60000) * 60000;
      const f = faceState(utc, offset);
      earth.setProperty(hmUI.prop.SRC, img(`earth/e${pad2(f.earthFrame % EARTH_FRAMES)}.png`));
      const moonSrc = img(`moon/m${pad2(f.moonFrame)}.png`);
      const shown = f.moonFront ? moonFront : moonBack, hidden = f.moonFront ? moonBack : moonFront;
      shown.setProperty(hmUI.prop.MORE, { x: f.moonX, y: f.moonY, src: moonSrc });
      shown.setProperty(hmUI.prop.VISIBLE, true);
      hidden.setProperty(hmUI.prop.VISIBLE, false);
      dateText.setProperty(hmUI.prop.MORE, { text: f.date });
      const lunar = `lunar/${f.lunarKey}`, phase = `phase/p${f.phaseIndex}`, gap = 6;
      const lx = Math.round(L.cx - (TEXT_W[lunar] + gap + TEXT_W[phase]) / 2);
      lunarImg.setProperty(hmUI.prop.MORE, { x: lx, src: img(lunar + '.png') });
      phaseImg.setProperty(hmUI.prop.MORE, { x: lx + TEXT_W[lunar] + gap, src: img(phase + '.png') });
      seasonText.setProperty(hmUI.prop.MORE, { text: f.season });
      statsLine.setProperty(hmUI.prop.MORE, { text: statsText(heart.last, step.current, battery.current) });
    };

    const start = () => {
      update();
      if (minuteTimer) timer.stopTimer(minuteTimer);
      minuteTimer = timer.createTimer((60 - time.second) * 1000 + 50, 60000, update, {});
    };
    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: start,
      pause_call: () => { if (minuteTimer) timer.stopTimer(minuteTimer); minuteTimer = null; },
    });
    battery.addEventListener(hmSensor.event.CHANGE, update);
    step.addEventListener(hmSensor.event.CHANGE, update);
    start();
  },

  onDestroy() {
    if (minuteTimer) timer.stopTimer(minuteTimer);
  },
});
