import { isTheme } from './themes.mjs';
const form = document.querySelector('#registration');
const name = document.querySelector('#display-name');
const consent = document.querySelector('#consent');
const request = document.querySelector('#accessibility');
const error = document.querySelector('#error');
const status = document.querySelector('#status');
document.querySelector('#theme').addEventListener('change', event => {
  if (isTheme(event.target.value)) document.documentElement.dataset.atlasTheme = event.target.value;
});
consent.addEventListener('change', () => {
  request.disabled = !consent.checked;
  document.querySelector('#request-fields').hidden = !consent.checked;
  if (!consent.checked) request.value = '';
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!name.value.trim()) {
    error.hidden = false;
    error.textContent = 'Enter an invented display name to continue.';
    name.setAttribute('aria-invalid', 'true');
    name.setAttribute('aria-describedby', 'name-help error');
    status.textContent = 'Simulation incomplete. Check the display name.';
    name.focus();
    return;
  }
  error.hidden = true;
  name.removeAttribute('aria-invalid');
  name.setAttribute('aria-describedby', 'name-help');
  status.textContent = 'Simulation complete. No registration was made and nothing was sent or saved.';
});
// Avoid browser history restoring form input, including sensitive free text.
window.addEventListener('pageshow', () => { form.reset(); request.value = ''; request.disabled = true; document.querySelector('#request-fields').hidden = true; });
