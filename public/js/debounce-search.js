(function(){
  function debounce(fn, wait){
    let t;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(()=>fn.apply(this, args), wait);
    };
  }

  // Submit a form safely
  function submitForm(form){ if (!form) return; try { form.submit(); } catch (e) { /* fallback */ const action = form.getAttribute('action') || window.location.pathname; const q = (form.querySelector('input[name="search"]')||form.querySelector('input[name="q"]')||{}).value || '' ; const url = new URL(action, window.location.origin); if (q) url.searchParams.set('search', q); window.location.href = url.toString(); } }

  // Attach debounce to inputs inside forms (common pattern)
  document.querySelectorAll('form').forEach(form => {
    const input = form.querySelector('input[name="search"], input[name="q"]');
    if (!input) return;
    const wait = parseInt(input.dataset.debounce) || 350;
    const handler = debounce(() => submitForm(form), wait);
    // Use input event for immediate responsiveness
    input.addEventListener('input', handler);
  });

  // Attach debounce for standalone inputs that should navigate when typed
  document.querySelectorAll('input[data-debounce-target], input[data-debounce-url]').forEach(input => {
    const wait = parseInt(input.dataset.debounce) || 400;
    const urlAttr = input.dataset.debounceUrl;
    const target = input.dataset.debounceTarget; // 'location' -> same pathname
    const handler = debounce(() => {
      const val = (input.value || '').trim();
      if (urlAttr) {
        try {
          const url = new URL(urlAttr, window.location.origin);
          if (val) url.searchParams.set('search', val);
          else url.searchParams.delete('search');
          window.location.href = url.toString();
        } catch (e) {
          // ignore invalid URL
        }
      } else if (target === 'location') {
        const url = new URL(window.location.pathname, window.location.origin);
        if (val) url.searchParams.set('search', val);
        else url.searchParams.delete('search');
        window.location.href = url.toString();
      }
    }, wait);
    input.addEventListener('input', handler);
  });

  // Fallback clearSearch if not already defined by app
  if (typeof window.clearSearch !== 'function') {
    window.clearSearch = function(){
      const input = document.querySelector('form input[name="q"], form input[name="search"], input#searchInput');
      if (input) {
        input.value = '';
        const form = input.closest('form');
        if (form) return submitForm(form);
        const url = new URL(window.location.pathname, window.location.origin);
        window.location.href = url.toString();
      }
    };
  }
})();
