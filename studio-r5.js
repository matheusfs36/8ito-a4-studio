(() => {
  function mountR5() {
    const toolbar = document.querySelector('.preview-toolbar');
    const page = document.getElementById('menuPage');
    const lockup = document.querySelector('.brand-lockup strong');
    if (!toolbar || !page || document.getElementById('r5ViewControls')) return;

    if (lockup && !document.querySelector('.r5-app-badge')) {
      const badge = document.createElement('span');
      badge.className = 'r5-app-badge';
      badge.textContent = 'R5 STUDIO';
      lockup.appendChild(badge);
    }

    const controls = document.createElement('div');
    controls.id = 'r5ViewControls';
    controls.className = 'r5-view-controls';
    controls.innerHTML = `
      <span>Visualização</span>
      <button type="button" data-width="620">75%</button>
      <button type="button" data-width="760" class="active">90%</button>
      <button type="button" data-width="860">100%</button>
      <span class="r5-divider"></span>
      <button type="button" id="r5Fit">Ajustar</button>
    `;
    toolbar.appendChild(controls);

    function setWidth(width, target) {
      document.documentElement.style.setProperty('--page-width', `${width}px`);
      controls.querySelectorAll('[data-width]').forEach((button) => button.classList.toggle('active', button === target));
    }

    controls.querySelectorAll('[data-width]').forEach((button) => {
      button.addEventListener('click', () => setWidth(Number(button.dataset.width), button));
    });

    document.getElementById('r5Fit')?.addEventListener('click', () => {
      const stage = document.querySelector('.preview-stage');
      if (!stage) return;
      const available = Math.max(520, Math.min(900, stage.clientWidth - 80));
      setWidth(available, null);
    });

    document.querySelectorAll('.panel-section').forEach((section, index) => {
      section.dataset.r5Section = String(index + 1).padStart(2, '0');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountR5);
  else mountR5();
})();
