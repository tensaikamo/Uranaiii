/**
 * 生まれた場所 — a place box that never asks anyone anything.
 *
 * Until now the only way in was a decimal longitude. That is a real barrier:
 * to be read at all you had to leave the page, find a map, read a number off
 * it, and come back. The spec ruled a city box out because geocoding means a
 * request — correct about geocoding, and wrong about city names. The table in
 * `places.js` ships with the app, so the lookup runs here, on the device, with
 * no request at all.
 *
 * **The number stays on screen.** The place box fills it in; it does not hide
 * it. Anyone who wants to type 141.79 still can, anyone who wants to check what
 * a place resolved to can see it, and nothing about the chart is decided by a
 * value the reader cannot look at. That is the same rule the rest of the app
 * follows — show the working.
 *
 * Progressive enhancement: the markup is a plain longitude input, and if this
 * module never runs the form is still complete and usable.
 */

import { findPlaces } from '../engine/places.js';
import { el } from './render.js';

/**
 * Put a place search above an existing longitude input.
 *
 * `longitudeId` is the input to fill. Returns nothing; everything is wired to
 * the DOM.
 */
export function attachPlaceField(longitudeId = 'longitude') {
  const lon = document.getElementById(longitudeId);
  if (!lon) return;
  const field = lon.closest('.field');
  if (!field) return;

  const wrap = el('div', 'field place-field');
  const label = el('label', null, '生まれた場所');
  label.htmlFor = 'place';
  wrap.append(label);

  const box = el('div', 'place-box');
  const input = el('input');
  input.type = 'text';
  input.id = 'place';
  input.autocomplete = 'off';
  input.placeholder = '市区町村（例: 岩見沢、さっぽろ）';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'place-list');
  input.setAttribute('aria-autocomplete', 'list');
  box.append(input);

  const list = el('ul', 'place-list');
  list.id = 'place-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  box.append(list);
  wrap.append(box);

  const note = el('p', 'hint place-note',
    '選ぶと下の経度が入ります。分からなければ経度を直接入れても占えます。');
  wrap.append(note);

  field.parentElement.insertBefore(wrap, field);

  let active = -1;
  let current = [];

  const close = () => {
    list.hidden = true;
    list.textContent = '';
    input.setAttribute('aria-expanded', 'false');
    active = -1;
    current = [];
  };

  const choose = (place) => {
    lon.value = String(place.lon);
    // The table carries three decimals and the input once allowed only two, so
    // filling it in produced a value the browser judged invalid — and an invalid
    // field makes the form refuse to submit *without saying anything*. The button
    // simply stopped working. The step is "any" now, and this guards the general
    // case: if the value we just wrote is not acceptable, say so rather than
    // leaving a dead button.
    if (!lon.checkValidity()) {
      note.textContent = `${place.pref}${place.city} の経度 ${place.lon} を入れられませんでした。`
        + '下の欄に直接入力してください。';
      close();
      return;
    }
    input.value = `${place.pref}${place.city}`;
    note.textContent = `${place.pref}${place.city} → 東経 ${place.lon}°。`
      + `真太陽時のずれは経度で決まるので、市区町村の中心で足ります。`;
    close();
    // Let anything watching the longitude know it moved.
    lon.dispatchEvent(new Event('input', { bubbles: true }));
    lon.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const paint = () => {
    list.textContent = '';
    for (const [i, p] of current.entries()) {
      const item = el('li', `place-item${i === active ? ' is-active' : ''}`);
      item.id = `place-item-${i}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(i === active));
      item.append(el('span', 'place-name', `${p.pref}${p.city}`));
      item.append(el('span', 'place-lon', `${p.lon}°E`));
      // pointerdown, not click: blur fires first on a tap and would close the
      // list before the click ever lands.
      item.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(p); });
      list.append(item);
    }
    list.hidden = current.length === 0;
    input.setAttribute('aria-expanded', String(current.length > 0));
    input.setAttribute('aria-activedescendant', active >= 0 ? `place-item-${active}` : '');
  };

  input.addEventListener('input', () => {
    current = findPlaces(input.value, 8);
    active = current.length > 0 ? 0 : -1;
    paint();
  });

  input.addEventListener('keydown', (event) => {
    if (list.hidden) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); active = (active + 1) % current.length; paint(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); active = (active - 1 + current.length) % current.length; paint(); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(current[active]); }
    else if (event.key === 'Escape') { close(); }
  });

  input.addEventListener('blur', () => { setTimeout(close, 120); });
}
