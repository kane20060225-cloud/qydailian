(function (global) {
  'use strict';
  function filter(accounts, values) {
    const text = value => String(value || '').toLowerCase();
    const unit = values.unit === 'day' ? 'daily_price' : 'hourly_price';
    const min = values.min === '' ? 0 : Number(values.min);
    const max = values.max === '' ? Infinity : Number(values.max);
    const filtered = accounts.filter(a => (!values.availabilityStatus || (a.availability_status || 'available') === values.availabilityStatus) && (!values.client || a.client_type === values.client) && text(a.tank_list).includes(text(values.tank)) && text(a.available_time_desc).includes(text(values.availability)) && Number(a[unit]) >= min && Number(a[unit]) <= max);
    if (values.sort === 'price') filtered.sort((a,b) => Number(a[unit]) - Number(b[unit]) || Number(a.id) - Number(b.id));
    return filtered;
  }
  let accounts = [], config;
  function render() {
    const form = document.getElementById('rentalFilters');
    const values = Object.fromEntries(new FormData(form));
    const result = filter(accounts, values);
    document.getElementById('rentalFilterResult').textContent = `符合筛选 ${result.length} / ${accounts.length} 个账号。可用时段按出租方说明查找，实际租用需确认。`;
    config.render(result, accounts.length);
  }
  function init(options) {
    config = options;
    const form = document.getElementById('rentalFilters');
    form.addEventListener('submit',e=>e.preventDefault());
    form.addEventListener('input',render); form.addEventListener('change',render);
    form.addEventListener('reset',()=>setTimeout(render,0));
  }
  global.RentalDiscovery = {filter,init,setAccounts(rows){accounts = rows; render();}};
})(window);
