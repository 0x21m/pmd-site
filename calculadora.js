// The calculator in section 04. On its own, so it works with reduced motion too (motion.js stops there); without
// JS the page already shows the worked example. Accepts Brazilian input: "50.000", "50000", "50.000,50", "12",
// "12,5", and also "12.5".
(() => {
  const form = document.getElementById('calc');
  if (!form) return;
  const fat = form.elements.fat, taxa = form.elements.taxa;
  const mes = document.getElementById('mes'), ano = document.getElementById('ano'), live = document.getElementById('calc-live');
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const hints = new Map([[fat, 'Em reais, por mês. Ex.: 50.000'], [taxa, 'Comissões e taxas somadas. Ex.: 12 ou 12,5']]);
  const errors = new Map([[fat, 'Digite um valor em reais, por exemplo 50.000.'], [taxa, 'Digite uma taxa entre 0 e 100, por exemplo 12,5.']]);

  const parse = raw => {
    let s = String(raw).replace(/[^\d.,]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/\.\d{3}(\.|$)/.test(s)) s = s.replace(/\./g, '');  // "50.000" is thousands; "12.5" is a decimal
    return Number(s);
  };

  const state = (input, ok) => {
    const hint = document.getElementById(input.getAttribute('aria-describedby'));
    if (ok) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
    hint.textContent = ok ? hints.get(input) : errors.get(input);
    hint.classList.toggle('is-error', !ok);
  };

  let announce;
  // speak: true announces now (submit), false after a pause in typing, null (on load) never.
  const compute = speak => {
    const f = parse(fat.value), t = parse(taxa.value);
    const okF = Number.isFinite(f) && f >= 0, okT = Number.isFinite(t) && t >= 0 && t <= 100;
    state(fat, okF || !fat.value);
    state(taxa, okT || !taxa.value);
    if (!okF || !okT) {
      mes.textContent = ano.textContent = '—';
      return false;
    }
    const m = f * t / 100;
    mes.textContent = brl.format(m);
    ano.textContent = brl.format(m * 12);
    // Screen readers hear only the final value.
    clearTimeout(announce);
    const say = () => { live.textContent = `Custo mensal: ${brl.format(m)}. Custo anual: ${brl.format(m * 12)}.`; };
    if (speak) say();
    else if (speak === false) announce = setTimeout(say, 900);
    return true;
  };

  form.addEventListener('input', () => compute(false));
  // The result sits beside the button, on the same screen, so submitting never scrolls.
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!compute(true)) (fat.getAttribute('aria-invalid') ? fat : taxa).focus();
  });
  // Leaving a field formats the number the Brazilian way (50000 → 50.000).
  [fat, taxa].forEach(input => input.addEventListener('blur', () => {
    const v = parse(input.value);
    if (Number.isFinite(v) && input.value) input.value = num.format(v);
  }));
  compute(null);
})();
