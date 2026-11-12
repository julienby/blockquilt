'use strict';
// PWA invité : enregistre le service worker sur l'espace de l'hôte, puis garde chaque rubrique en cache pour lire hors ligne.
const script = document.currentScript;
if (script?.dataset.scope && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(script.dataset.sw, {scope: script.dataset.scope}).catch(() => {});
  addEventListener('load', () => {
    for (const a of document.querySelectorAll('a[data-section]')) fetch(a.href, {credentials: 'same-origin'}).catch(() => {});
  });
}

// Formulaires de séjour : le départ suit l'arrivée (même durée), jamais avant elle ; les dates d'accès restent avant le départ.
function shiftDate(day, days) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
/** Départ à garder quand l'arrivée passe de `oldFrom` à `from`. Vide si l'hôte n'a pas encore choisi de départ. */
function nextDeparture(oldFrom, from, to) {
  if (!from) return to;
  if (!to) return from;
  const kept = oldFrom ? shiftDate(from, daysBetween(oldFrom, to)) : to;
  return kept < from ? from : kept;
}
function syncStayDates(form, changed) {
  const f = (name) => form.elements[name];
  if (f('from') && f('to')) {
    if (changed === 'from') f('to').value = nextDeparture(form.dataset.from, f('from').value, f('to').value);
    form.dataset.from = f('from').value;
    f('to').min = f('from').value;
  }
  for (const name of ['access_from', 'sensitive_from']) if (f(name) && f('to')) f(name).max = f('to').value;
}
document.addEventListener('change', (event) => {
  if (event.target.matches('select[data-nav]')) { location.href = event.target.value; return; }
  const form = event.target.form;
  if (form?.hasAttribute('data-stay-dates') && ['from', 'to'].includes(event.target.name)) syncStayDates(form, event.target.name);
});
for (const form of document.querySelectorAll('form[data-stay-dates]')) syncStayDates(form, '');

// Version choisie : positionne les interrupteurs de rubriques du même formulaire (data-presets = {id de version: [adresses]}).
document.addEventListener('change', (event) => {
  const select = event.target.closest('select[data-presets]');
  if (!select) return;
  const on = JSON.parse(select.dataset.presets)[select.value] ?? [];
  for (const box of select.form.querySelectorAll('input[name="sections[]"]')) box.checked = on.includes(box.value);
});

// « Voir seulement les rubriques actives » : cache les lignes Off au moment du clic (une ligne décochée ensuite reste visible).
document.addEventListener('change', (event) => {
  if (!event.target.matches('input[data-only-on]')) return;
  for (const box of document.querySelectorAll('#' + event.target.dataset.onlyOn + ' input[type=checkbox]')) {
    box.closest('li').hidden = event.target.checked && !box.checked;
  }
});

// Fenêtres de confirmation : [data-dialog] ouvre le <dialog> visé, [data-close] ferme celui qui le contient.
document.addEventListener('click', (event) => {
  const open = event.target.closest('[data-dialog]');
  if (open) {
    open.closest('dialog')?.close();
    document.getElementById(open.dataset.dialog)?.showModal();
  }
  if (event.target.closest('[data-close]')) event.target.closest('dialog')?.close();
});

// Un toucher en dehors d'un menu ouvert le ferme : <details> (menus et aperçus) et feuilles <dialog> (le fond grisé).
// Une feuille se ferme seulement si le toucher commence ET finit sur le fond : glisser depuis l'intérieur ne la ferme pas.
const outside = (dialog, event) => {
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
};
let pressedBackdrop = false;
document.addEventListener('pointerdown', (event) => {
  for (const menu of document.querySelectorAll('details[open]')) {
    if (!menu.hasAttribute?.('data-next-stay-panel') && !menu.contains(event.target)) menu.open = false;
  }
  pressedBackdrop = event.target instanceof HTMLDialogElement && outside(event.target, event);
});
document.addEventListener('click', (event) => {
  if (pressedBackdrop && event.target instanceof HTMLDialogElement && outside(event.target, event)) event.target.close();
  pressedBackdrop = false;
});

// Boutons « copier » : [data-copy] met le texte dans le presse-papiers et montre une coche un instant.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(button.previousElementSibling ?? button);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return;
  }
  button.querySelector('[data-copy-icon]').hidden = true;
  button.querySelector('[data-copy-done]').hidden = false;
  setTimeout(() => {
    button.querySelector('[data-copy-icon]').hidden = false;
    button.querySelector('[data-copy-done]').hidden = true;
  }, 1500);
});

// Feuille à choix unique, interrupteur automatique (form[data-autosubmit]) ou titre modifiable in-place (form[data-inline-title]) : changer la valeur envoie le formulaire.
document.addEventListener('change', (event) => {
  if ((event.target.type === 'radio' || event.target.type === 'checkbox') && event.target.form?.hasAttribute('data-autosubmit')) event.target.form.requestSubmit();
  if (event.target.matches('input[data-title-input]') && event.target.value.trim() !== '') event.target.form?.requestSubmit();
});
document.addEventListener('click', (event) => {
  const focusBtn = event.target.closest('[data-title-focus]');
  if (!focusBtn) return;
  const input = focusBtn.closest('form')?.querySelector('input[data-title-input]');
  if (input) { input.focus(); input.select(); }
});

// Ordre des rubriques : glisser par la poignée [data-grip] (doigt ou souris, sans dépendance externe) ; enregistrement automatique sur form[data-auto-order].
const orderList = document.getElementById('order');
if (orderList) {
  orderList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-move]');
    if (!button) return;
    const item = button.closest('li');
    const other = button.dataset.move === 'up' ? item.previousElementSibling : item.nextElementSibling;
    if (other) button.dataset.move === 'up' ? other.before(item) : other.after(item);
    button.focus();
  });
}

let dragLi = null;
let dragUl = null;
document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('#ehg')) return;
  const grip = event.target.closest('[data-grip], [data-handle]');
  if (!grip) return;
  const li = grip.closest('li');
  const ul = li?.parentElement;
  if (!li || !ul) return;
  dragLi = li;
  dragUl = ul;
  dragLi.classList.add('bg-stone-100', 'opacity-70');
  grip.setPointerCapture(event.pointerId);
  event.preventDefault();
});
document.addEventListener('pointermove', (event) => {
  if (!dragLi || !dragUl) return;
  const others = [...dragUl.children].filter((c) => c !== dragLi);
  const next = others.find((c) => event.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
  if (next) next.before(dragLi);
  else if (others.length) others[others.length - 1].after(dragLi);
});
const finishListDrag = () => {
  if (!dragLi) return;
  const form = dragUl?.closest('form[data-auto-order]');
  dragLi.classList.remove('bg-stone-100', 'opacity-70');
  dragLi = null;
  dragUl = null;
  if (form) {
    fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin' }).catch(() => {});
  }
};
document.addEventListener('pointerup', finishListDrag);
document.addEventListener('pointercancel', finishListDrag);

document.addEventListener('click', (event) => {
  const delBtn = event.target.closest('[data-delete-section]');
  if (!delBtn) return;
  const dialog = document.getElementById('sec-del');
  if (!dialog) return;
  const slugInput = dialog.querySelector('input[name="slug"]');
  const titleEl = dialog.querySelector('[data-sec-del-title]');
  if (slugInput) slugInput.value = delBtn.dataset.deleteSection;
  if (titleEl) titleEl.textContent = delBtn.dataset.deleteTitle || '';
  dialog.showModal();
});

// Retour sur un formulaire (< data-form-back) : ouvre la modale #form-leave si des champs ont été modifiés sans enregistrer.
let formDirty = false;
document.addEventListener('input', (event) => {
  const f = event.target.form;
  if (f && !f.hasAttribute('data-auto-order') && !f.hasAttribute('data-inline-title') && !f.closest('dialog')) formDirty = true;
});
document.addEventListener('change', (event) => {
  const f = event.target.form;
  if (f && !f.hasAttribute('data-auto-order') && !f.hasAttribute('data-inline-title') && !f.closest('dialog')) formDirty = true;
});
document.addEventListener('submit', () => { formDirty = false; });
document.addEventListener('click', (event) => {
  const back = event.target.closest('a[data-form-back]');
  if (!back || !formDirty) return;
  const leaveDialog = document.getElementById('form-leave');
  if (!leaveDialog) return;
  event.preventDefault();
  const confirmLink = leaveDialog.querySelector('[data-form-leave-confirm]');
  if (confirmLink) confirmLink.href = back.href;
  leaveDialog.showModal();
});

// Zone de dépôt glisser-déposer (drag & drop) pour les fichiers PDF ou photos ([data-dropzone]).
document.addEventListener('change', (event) => {
  const input = event.target.closest('[data-dropzone] input[type="file"]');
  if (!input) return;
  const label = input.closest('[data-dropzone]')?.querySelector('[data-dropzone-name]');
  if (label && input.files?.[0]) {
    label.textContent = 'Fichier sélectionné : ' + input.files[0].name;
    label.classList.add('font-semibold', 'text-brand-700');
  }
});
for (const evt of ['dragenter', 'dragover']) {
  document.addEventListener(evt, (event) => {
    const zone = event.target.closest?.('[data-dropzone]');
    if (!zone) return;
    event.preventDefault();
    zone.classList.add('border-brand-600', 'bg-brand-50');
  });
}
for (const evt of ['dragleave', 'drop']) {
  document.addEventListener(evt, (event) => {
    const zone = event.target.closest?.('[data-dropzone]');
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('border-brand-600', 'bg-brand-50');
    if (evt === 'drop' && event.dataTransfer?.files?.length) {
      const input = zone.querySelector('input[type="file"]');
      if (input) {
        input.files = event.dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

// Animation & barre de progression pour l'import PDF (1. Import du fichier -> 2. Interprétation du document -> 3. Génération du guide)
(() => {
  let timer = null;

  function setStep(container, num, state) {
    const el = container.querySelector(`[data-pdf-step="${num}"]`);
    if (!el) return;
    const icon = el.querySelector('[data-step-icon]');
    const label = el.querySelector('[data-step-label]');
    if (state === 'done') {
      if (icon) {
        icon.className = 'flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs ring-2 ring-emerald-200 transition-all';
        icon.textContent = '✓';
      }
      if (label) label.className = 'font-semibold text-emerald-800 leading-tight transition-colors';
    } else if (state === 'active') {
      if (icon) {
        icon.className = 'flex size-7 items-center justify-center rounded-full bg-brand-600 text-white font-bold text-xs ring-4 ring-brand-100 animate-pulse transition-all';
        icon.textContent = String(num);
      }
      if (label) label.className = 'font-semibold text-brand-900 leading-tight transition-colors';
    } else {
      if (icon) {
        icon.className = 'flex size-7 items-center justify-center rounded-full bg-stone-100 text-stone-400 font-semibold text-xs transition-all';
        icon.textContent = String(num);
      }
      if (label) label.className = 'font-medium text-stone-400 leading-tight transition-colors';
    }
  }

  function startPdfProgress(form) {
    const progress = document.querySelector('[data-pdf-progress]');
    if (!progress) return;

    if (form.closest('dialog')) form.closest('dialog').close();

    const bar = progress.querySelector('[data-pdf-bar]');
    const percentEl = progress.querySelector('[data-pdf-percent]');
    const titleEl = progress.querySelector('[data-pdf-status-title]');
    const subEl = progress.querySelector('[data-pdf-status-sub]');
    const dropzoneArea = document.querySelector('[data-pdf-form-fields]');

    if (dropzoneArea) dropzoneArea.classList.add('hidden');
    progress.classList.remove('hidden');
    progress.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    let current = 5;
    let step = 1;
    let elapsed = 0;

    const setPercent = (val, title, sub) => {
      const p = Math.min(100, Math.max(0, Math.round(val)));
      if (bar) bar.style.width = p + '%';
      if (percentEl) percentEl.textContent = p + '%';
      if (title && titleEl) titleEl.textContent = title;
      if (sub && subEl) subEl.textContent = sub;
      const roleBar = progress.querySelector('[role="progressbar"]');
      if (roleBar) roleBar.setAttribute('aria-valuenow', String(p));
    };

    setStep(progress, 1, 'active');
    setStep(progress, 2, 'pending');
    setStep(progress, 3, 'pending');
    setPercent(5, 'Import du fichier…', 'Téléversement de votre document PDF en cours…');

    clearInterval(timer);
    timer = setInterval(() => {
      elapsed += 0.5;
      if (step === 1) {
        if (current < 25) {
          current += 5;
          setPercent(current, 'Import du fichier…', 'Téléversement en cours…');
        } else {
          step = 2;
          setStep(progress, 1, 'done');
          setStep(progress, 2, 'active');
          setPercent(28, 'Interprétation du document…', 'Lecture et analyse du PDF par l’IA…');
        }
      } else if (step === 2) {
        if (current < 88) {
          const stepInc = current < 50 ? 1.8 : (current < 75 ? 0.9 : 0.35);
          current += stepInc;
          let sub = 'Lecture et analyse du PDF par l’IA…';
          if (elapsed > 8) sub = 'Détection des consignes, Wi-Fi et accès…';
          if (elapsed > 18) sub = 'Organisation et structuration des rubriques…';
          if (elapsed > 28) sub = 'Finalisation de l’analyse intelligente…';
          setPercent(current, 'Interprétation du document…', sub);
        }
      }
    }, 500);

    const onProgress = (event) => {
      if (event.detail?.lengthComputable && step === 1) {
        const uploadPercent = (event.detail.loaded / event.detail.total) * 25;
        current = Math.max(current, uploadPercent);
        setPercent(current, 'Import du fichier…', 'Téléversement : ' + Math.round((event.detail.loaded / event.detail.total) * 100) + '%');
      }
    };

    const onComplete = (event) => {
      if (event.target !== form) return;
      clearInterval(timer);
      form.removeEventListener('htmx:xhr:progress', onProgress);
      form.removeEventListener('htmx:afterRequest', onComplete);

      if (event.detail?.successful) {
        step = 3;
        setStep(progress, 1, 'done');
        setStep(progress, 2, 'done');
        setStep(progress, 3, 'done');
        setPercent(100, 'Génération du guide terminée !', 'Ouverture de la page de relecture…');
      } else {
        progress.classList.add('hidden');
        if (dropzoneArea) dropzoneArea.classList.remove('hidden');
        const submitBtn = form.querySelector('button');
        if (submitBtn) submitBtn.removeAttribute('disabled');
      }
    };

    form.addEventListener('htmx:xhr:progress', onProgress);
    form.addEventListener('htmx:afterRequest', onComplete);
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-pdf-form]');
    if (form) startPdfProgress(form);
  });
})();
