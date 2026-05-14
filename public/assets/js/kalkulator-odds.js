(function(){
  const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const $ = (selector) => document.querySelector(selector);
  const legsContainer = $('#legsContainer');
  const stakeInput = $('#stake');
  const addButton = $('#addLeg');
  const calculateButton = $('#calculateOdds');
  const resetButton = $('#resetOdds');
  const totalOddsEl = $('#totalOdds');
  const payoutEl = $('#payout');
  const profitEl = $('#profit');
  const noticeEl = $('#calcNotice');

  if(!legsContainer || !stakeInput || !addButton || !calculateButton || !resetButton){ return; }

  function setNotice(message){
    noticeEl.textContent = message || '';
    noticeEl.classList.toggle('show', Boolean(message));
  }

  function renumber(){
    legsContainer.querySelectorAll('.calc-leg').forEach((leg, index) => {
      const no = leg.querySelector('.calc-leg-no');
      if(no) no.textContent = String(index + 1);
    });
  }

  function makeLeg(value = ''){
    const leg = document.createElement('div');
    leg.className = 'calc-leg';
    leg.innerHTML = `
      <div class="calc-leg-no">1</div>
      <input class="oddsInput" type="number" inputmode="decimal" min="1" step="0.01" placeholder="Contoh: 1.85" autocomplete="off" value="${value}">
      <button class="calc-remove" type="button" aria-label="Hapus odds">×</button>
    `;
    leg.querySelector('.calc-remove').addEventListener('click', () => {
      if(legsContainer.querySelectorAll('.calc-leg').length <= 1){
        setNotice('Minimal harus ada satu odds.');
        return;
      }
      leg.remove();
      renumber();
      calculate(false);
    });
    leg.querySelector('.oddsInput').addEventListener('input', () => calculate(false));
    return leg;
  }

  function getValues(showError = true){
    const stake = Number(stakeInput.value);
    const inputs = [...legsContainer.querySelectorAll('.oddsInput')];
    let valid = true;
    let totalOdds = 1;

    if(!Number.isFinite(stake) || stake <= 0){
      valid = false;
      stakeInput.classList.add('is-error');
    }else{
      stakeInput.classList.remove('is-error');
    }

    inputs.forEach((input) => {
      const value = Number(input.value);
      if(!Number.isFinite(value) || value < 1){
        if(input.value.trim() !== '') input.classList.add('is-error');
        valid = false;
      }else{
        input.classList.remove('is-error');
        totalOdds *= value;
      }
    });

    if(!valid && showError){
      setNotice('Isi nominal dan odds dengan angka valid. Odds minimal 1.00.');
    }

    return { valid, stake, totalOdds };
  }

  function calculate(showError = true){
    const { valid, stake, totalOdds } = getValues(showError);
    if(!valid){
      totalOddsEl.textContent = '1.00';
      payoutEl.textContent = rupiah.format(0);
      profitEl.textContent = rupiah.format(0);
      return;
    }
    const payout = stake * totalOdds;
    const profit = payout - stake;
    totalOddsEl.textContent = totalOdds.toFixed(2);
    payoutEl.textContent = rupiah.format(payout);
    profitEl.textContent = rupiah.format(profit);
    setNotice('');
  }

  addButton.addEventListener('click', () => {
    legsContainer.appendChild(makeLeg());
    renumber();
    const inputs = legsContainer.querySelectorAll('.oddsInput');
    inputs[inputs.length - 1].focus();
  });

  calculateButton.addEventListener('click', () => calculate(true));

  resetButton.addEventListener('click', () => {
    legsContainer.innerHTML = '';
    legsContainer.appendChild(makeLeg());
    stakeInput.value = '100000';
    totalOddsEl.textContent = '1.00';
    payoutEl.textContent = rupiah.format(0);
    profitEl.textContent = rupiah.format(0);
    setNotice('');
    renumber();
  });

  stakeInput.addEventListener('input', () => calculate(false));

  const firstRemove = legsContainer.querySelector('.calc-remove');
  const firstInput = legsContainer.querySelector('.oddsInput');
  if(firstRemove){
    firstRemove.addEventListener('click', () => setNotice('Minimal harus ada satu odds.'));
  }
  if(firstInput){
    firstInput.addEventListener('input', () => calculate(false));
  }

  calculate(false);
})();
