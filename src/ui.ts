// Dress-up and scene pickers.
import { PALETTE, DEFAULT_LOOK, type Look } from './character';
import { SCENES, type SceneName } from './scenes';
import { EFFECTS, type EffectId } from './effects';

// Bumped when the default character changes, so an old saved look does not hide the new one.
const KEY = 'voyager-mirror-look-v3';

export function loadLook(): Look {
  try { return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_LOOK }; }
}
const save = (l: Look) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private window */ } };

const CHOICES = {
  hairStyle: [['waves', 'Long waves'], ['cards', 'Realistic waves'], ['puffs', 'Puffs'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['braids', 'Braids'], ['bob', 'Bob']],
  outfit: [['voyager', 'Island voyager'], ['shorts', 'Tunic and shorts'], ['dress', 'Dress']],
  accessory: [['none', 'None'], ['flower', 'Flower'], ['starfish', 'Starfish'], ['bow', 'Bow']],
  prop: [['oar', 'Oar'], ['none', 'Nothing']],
} as const;

export function buildDressPanel(el: HTMLElement, look: Look, onChange: (l: Look) => void) {
  const render = () => {
    el.innerHTML = '';
    const head = document.createElement('div'); head.className = 'head';
    head.innerHTML = '<h2>Dress up</h2>';
    const rnd = document.createElement('button'); rnd.className = 'chip'; rnd.textContent = 'Surprise me';
    rnd.onclick = () => {
      const pick = <T,>(a: readonly T[]) => a[(Math.random() * a.length) | 0];
      Object.assign(look, {
        skin: pick(PALETTE.skin), hairColor: pick(PALETTE.hair), eyeColor: pick(PALETTE.eyes),
        hairStyle: pick(CHOICES.hairStyle)[0], outfit: pick(CHOICES.outfit)[0], accessory: pick(CHOICES.accessory)[0], prop: pick(CHOICES.prop)[0],
        topColor: pick(PALETTE.cloth), bottomColor: pick(PALETTE.cloth), accentColor: pick(PALETTE.cloth),
      });
      commit();
    };
    head.appendChild(rnd); el.appendChild(head);

    const section = (title: string) => {
      const h = document.createElement('h3'); h.textContent = title; el.appendChild(h);
      const d = document.createElement('div'); d.className = 'opts'; el.appendChild(d); return d;
    };
    const options = (title: string, key: keyof typeof CHOICES) => {
      const d = section(title);
      for (const [val, label] of CHOICES[key]) {
        const b = document.createElement('button'); b.className = 'opt' + (look[key] === val ? ' on' : ''); b.textContent = label;
        b.onclick = () => { (look as unknown as Record<string, string>)[key] = val; commit(); };
        d.appendChild(b);
      }
    };
    const swatches = (title: string, key: 'skin' | 'hairColor' | 'eyeColor' | 'topColor' | 'bottomColor' | 'accentColor', colors: string[]) => {
      const d = section(title);
      for (const c of colors) {
        const b = document.createElement('button'); b.className = 'sw' + (look[key] === c ? ' on' : '');
        b.style.background = c; b.setAttribute('aria-label', `${title} ${c}`);
        b.onclick = () => { look[key] = c; commit(); };
        d.appendChild(b);
      }
    };
    options('Hair style', 'hairStyle');
    swatches('Hair color', 'hairColor', PALETTE.hair);
    swatches('Skin', 'skin', PALETTE.skin);
    swatches('Eyes', 'eyeColor', PALETTE.eyes);
    options('Outfit', 'outfit');
    swatches('Top color', 'topColor', PALETTE.cloth);
    swatches('Bottom color', 'bottomColor', PALETTE.cloth);
    options('Hair clip', 'accessory');
    swatches('Sash, belt and clip color', 'accentColor', PALETTE.cloth);
    options('Carry', 'prop');
  };
  const commit = () => { const top = el.scrollTop; save(look); onChange(look); render(); el.scrollTop = top; };
  render();
}

export function buildScenePanel(el: HTMLElement, current: () => SceneName, onPick: (s: SceneName) => void) {
  const render = () => {
    el.innerHTML = '<h2>Scene</h2>';
    const d = document.createElement('div'); d.className = 'opts';
    for (const s of SCENES) {
      const b = document.createElement('button'); b.className = 'scene' + (current() === s.id ? ' on' : '');
      b.dataset.scene = s.id; b.textContent = s.label;
      b.onclick = () => { onPick(s.id); render(); };
      d.appendChild(b);
    }
    el.appendChild(d);
  };
  render();
  return render;
}

/** The Effects panel: an on/off switch and every effect with how to start it. */
export function buildEffectsPanel(el: HTMLElement, found: Set<EffectId>, isOn: () => boolean, setOn: (on: boolean) => void) {
  const render = () => {
    el.innerHTML = '';
    const head = document.createElement('div'); head.className = 'head';
    head.innerHTML = `<h2>Effects</h2>`;
    const sw = document.createElement('button'); sw.className = 'chip toggle' + (isOn() ? ' on' : '');
    sw.textContent = isOn() ? 'Effects on' : 'Effects off';
    sw.setAttribute('aria-pressed', String(isOn()));
    sw.onclick = () => { setOn(!isOn()); render(); };
    head.appendChild(sw); el.appendChild(head);
    const p = document.createElement('p'); p.className = 'fine count';
    p.textContent = `You have found ${EFFECTS.filter((e) => found.has(e.id)).length} of ${EFFECTS.length}. Try these moves:`;
    el.appendChild(p);
    const list = document.createElement('ul'); list.className = 'fxlist';
    for (const e of EFFECTS) {
      const li = document.createElement('li'); li.dataset.fx = e.id; li.className = found.has(e.id) ? 'found' : '';
      li.innerHTML = `<span class="tick" aria-hidden="true"></span><span class="txt"><b></b><span class="how"></span></span>`;
      li.querySelector('b')!.textContent = e.name;
      li.querySelector('.how')!.textContent = e.how;
      if (e.note) { const n = document.createElement('span'); n.className = 'note'; n.textContent = e.note; li.querySelector('.txt')!.appendChild(n); }
      list.appendChild(li);
    }
    el.appendChild(list);
  };
  render();
  return {
    render,
    /** Briefly highlights an effect's row when it happens. */
    flash(id: EffectId) {
      const li = el.querySelector<HTMLElement>(`[data-fx="${id}"]`);
      if (!li) return;
      li.classList.remove('pop'); void li.offsetWidth; li.classList.add('pop');
    },
  };
}
