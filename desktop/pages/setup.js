const params = new URLSearchParams(location.search);
const form = document.getElementById('form');
const input = document.getElementById('server');
const errorEl = document.getElementById('error');
const retry = document.getElementById('retry');

input.value = params.get('server') || '';
if (params.get('error')) {
  errorEl.textContent = params.get('error');
  errorEl.hidden = false;
  retry.hidden = !input.value;
}
input.focus();
input.select();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const result = await window.setupBridge.connect(input.value);
  if (result && result.error) {
    errorEl.textContent = result.error;
    errorEl.hidden = false;
  }
});
retry.addEventListener('click', () => window.setupBridge.retry());
