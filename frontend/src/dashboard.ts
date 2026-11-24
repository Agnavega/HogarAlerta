type User = { name: string; email: string };
type State = 'normal' | 'warning' | 'critical' | 'empty';
type Sensor = {
  id: string; name: string; description: string; location: string; unit: string;
  warningThreshold: number; criticalThreshold: number; value: number | null; status: State;
};
type Sample = { timestamp: string; values: Record<string, number | undefined> };
type Snapshot = {
  timestamp: string | null; scenario: string; scenarios: { id: string; name: string }[];
  sensors: Sensor[]; history: Sample[]; state: State; activity: { timestamp: string; state: State }[];
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const loginForm = $<HTMLFormElement>('login-form');
const userForm = $<HTMLFormElement>('user-form');
const loginButton = loginForm.querySelector('button')!;
const logout = $<HTMLButtonElement>('logout');
const refresh = $<HTMLButtonElement>('refresh');
const metric = $<HTMLSelectElement>('metric');
const scenario = $<HTMLSelectElement>('scenario');
const labels = { normal: 'Normal', warning: 'Precaución', critical: 'Riesgo alto', empty: 'Sin lectura' };
const states = {
  normal: ['Todo está bajo control', 'Los niveles están dentro de los rangos de prueba.'],
  warning: ['Hay cambios en el ambiente', 'Al menos un sensor supera el nivel de precaución.'],
  critical: ['Atención: riesgo alto detectado', 'Al menos un sensor supera el umbral crítico.'],
  empty: ['Sin lecturas disponibles', 'El escenario aún no tiene mediciones.']
};
const views = {
  overview: ['Vista general', 'Tu hogar, en equilibrio.', 'Estado general del hogar y resumen de la actividad.'],
  sensors: ['Sensores', 'Los sensores de tu hogar.', 'Consulta las lecturas, sus tendencias y los umbrales de alerta.'],
  activity: ['Actividad', 'La actividad de tu hogar.', 'Estados detectados en las lecturas guardadas del escenario.'],
  users: ['Usuarios', 'Usuarios del panel', 'Todas las cuentas tienen el mismo acceso al panel.']
};
const number = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' });
let user: User | null = null;
let latest: Snapshot | null = null;
let pending: AbortController | null = null;

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function api<T>(path: string, body?: object, signal = AbortSignal.timeout(5000)): Promise<T> {
  const response = await fetch('/api/' + path, {
    signal, cache: 'no-store',
    ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error);
  return data;
}

function message(error: unknown) {
  return error instanceof ApiError ? error.message : 'No se pudo conectar con el servidor. Intenta de nuevo.';
}

function showLogin(text = '') {
  user = null;
  pending?.abort();
  latest = null;
  for (const id of ['sensor-grid', 'thresholds', 'events', 'metric', 'scenario']) $(id).replaceChildren();
  userForm.reset();
  $('user-message').textContent = '';
  $('sidebar').hidden = $('overview').hidden = true;
  $('login-panel').hidden = false;
  $('login-message').textContent = text;
  loginButton.disabled = false;
}

function showDashboard(account: User) {
  user = account;
  $('profile-name').textContent = account.name;
  $('profile-email').textContent = account.email;
  $('login-panel').hidden = true;
  $('data-message').hidden = true;
  $('sidebar').hidden = $('overview').hidden = false;
  navigate();
  void load();
}

function navigate() {
  if (!user) return;
  const key = location.hash.slice(1);
  const view = Object.hasOwn(views, key) ? key as keyof typeof views : 'overview';
  const [label, title, description] = views[view];
  document.body.dataset.view = view;
  $('current-view').textContent = label;
  $('page-title').textContent = title;
  $('page-description').textContent = description;
  $('users-panel').hidden = view !== 'users';
  $('logout-message').textContent = '';
  document.title = 'Hogar Alerta · ' + label;
  document.querySelectorAll('nav a').forEach(link => {
    const selected = link.getAttribute('href') === '#' + view;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  $('page-title').focus({ preventScroll: true });
}

function selectOptions(select: HTMLSelectElement, options: { id: string; name: string }[], value: string) {
  const unchanged = select.length === options.length && options.every((option, index) =>
    select.options[index].value === option.id && select.options[index].text === option.name);
  if (!unchanged) select.replaceChildren(...options.map(option => new Option(option.name, option.id)));
  if (options.some(option => option.id === value)) select.value = value;
}

function plot(samples: Sample[], id: string, width: number, height: number) {
  const values = samples.flatMap(sample => sample.values[id] ?? []);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  let connected = false;
  const path = samples.map((sample, index) => {
    const value = sample.values[id];
    if (value == null) { connected = false; return ''; }
    const command = connected ? 'L' : 'M';
    connected = true;
    return command + (index * width / Math.max(1, samples.length - 1)).toFixed(1) + ',' +
      (height - (value - min) * height / (max - min)).toFixed(1);
  }).join(' ');
  return { path, min, max, count: values.length };
}

function draw() {
  const sensor = latest?.sensors.find(item => item.id === metric.value);
  const history = latest?.history ?? [];
  const series = sensor ? plot(history, sensor.id, 700, 170) : null;
  const visible = Boolean(series && series.count > 1);
  document.getElementById('chart-line')!.setAttribute('d', visible ? series!.path : '');
  const axis = $('chart-axis').querySelectorAll('span');
  const ticks = series && visible ? [series.max, (series.max + series.min) / 2, series.min] : [];
  axis.forEach((span, index) => { span.textContent = ticks.length ? number.format(ticks[index]) : '—'; });
  $('chart-empty').hidden = visible;
  $('chart-empty').textContent = latest ? 'Aún no hay suficientes lecturas.' : 'Sin conexión con los datos.';
  $('chart-start').textContent = visible ? date.format(new Date(history[0].timestamp)) : '';
  $('chart-end').textContent = visible ? date.format(new Date(history.at(-1)!.timestamp)) : '';
  $('legend').textContent = sensor ? sensor.name + ' · ' + sensor.unit : '';
}

function render(data: Snapshot) {
  latest = data;
  $('data-message').hidden = true;
  document.body.dataset.state = data.state;
  $('hero-label').textContent = 'MONITOREO · SIMULACIÓN';
  $('status-title').textContent = states[data.state][0];
  $('status-description').textContent = states[data.state][1];
  $('connection-indicator').textContent = '●';
  $('connection-text').textContent = 'Servidor conectado';
  document.querySelector('.shield')!.textContent = data.state === 'normal' ? '✓' : '!';
  $('last-update').textContent = data.timestamp ? 'Última lectura · ' + date.format(new Date(data.timestamp)) : 'Sin lecturas';
  $('sensor-count').textContent = data.sensors.length + ' sensores configurados';
  selectOptions(scenario, data.scenarios, data.scenario);
  selectOptions(metric, data.sensors, metric.value);
  const cards = [];
  const rows = [];
  const template = $<HTMLTemplateElement>('sensor-template');
  for (const [index, sensor] of data.sensors.entries()) {
    const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    card.classList.add(['orange', 'teal', 'purple'][index % 3]);
    card.dataset.status = sensor.status;
    card.querySelector('.sensor-status')!.textContent = labels[sensor.status];
    card.querySelector('h3')!.textContent = sensor.name;
    card.querySelector('p')!.textContent = sensor.description;
    card.querySelector('.measurement strong')!.textContent = sensor.value == null ? '—' : number.format(sensor.value);
    card.querySelector('.measurement span')!.textContent = sensor.unit;
    card.querySelector('path')!.setAttribute('d', plot(data.history, sensor.id, 300, 40).path);
    const warning = number.format(sensor.warningThreshold) + ' ' + sensor.unit;
    const critical = number.format(sensor.criticalThreshold) + ' ' + sensor.unit;
    card.querySelector('.card-footer')!.textContent = 'Atención desde ' + warning;
    cards.push(card);
    const row = document.createElement('tr');
    for (const value of [sensor.name, sensor.location, '≥ ' + warning, '≥ ' + critical]) {
      row.insertCell().textContent = value;
    }
    rows.push(row);
  }
  $('sensor-grid').replaceChildren(...cards);
  $('thresholds').replaceChildren(...rows);
  const events = data.activity.map(item => {
    const entry = document.createElement('div');
    entry.className = 'event';
    const title = document.createElement('strong');
    title.textContent = labels[item.state];
    const time = document.createElement('p');
    time.textContent = date.format(new Date(item.timestamp));
    const content = document.createElement('div');
    content.append(title, time);
    entry.append(content);
    return entry;
  });
  const eventList = $('events');
  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-activity';
    empty.textContent = 'Aún no hay actividad registrada en este escenario.';
    events.push(empty);
  }
  if (eventList.textContent !== events.map(event => event.textContent).join('')) eventList.replaceChildren(...events);
  draw();
}

async function load(replace = false) {
  if (!user || (pending && !replace)) return;
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  refresh.disabled = true;
  try {
    const params = new URLSearchParams();
    if (scenario.value) params.set('scenario', scenario.value);
    const data = await api<Snapshot>('sensors?' + params, undefined,
      AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
    if (!controller.signal.aborted) render(data);
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof ApiError && error.status === 401) {
      showLogin(error.message);
      return;
    }
    if (error instanceof ApiError && error.status === 400 && scenario.value) {
      scenario.replaceChildren();
      void load(true);
      return;
    }
    latest = null;
    document.body.dataset.state = 'offline';
    $('hero-label').textContent = 'ERROR DE CONEXIÓN';
    $('status-title').textContent = 'Datos no disponibles';
    $('status-description').textContent = message(error);
    $('data-message').textContent = message(error);
    $('data-message').hidden = false;
    $('connection-indicator').textContent = '⊗';
    $('connection-text').textContent = 'Sin conexión';
    $('last-update').textContent = 'Sin datos actuales';
    $('sensor-count').textContent = '';
    for (const id of ['sensor-grid', 'thresholds', 'events']) $(id).replaceChildren();
    draw();
  } finally {
    if (pending === controller) {
      pending = null;
      refresh.disabled = false;
    }
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginButton.disabled = true;
  $('login-message').textContent = '';
  try {
    const account = await api<User>('login', Object.fromEntries(new FormData(loginForm)));
    loginForm.reset();
    showDashboard(account);
  } catch (error) {
    $('login-message').textContent = message(error);
  } finally {
    loginButton.disabled = false;
  }
});

userForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = userForm.querySelector('button')!;
  button.disabled = true;
  $('user-message').textContent = '';
  try {
    const account = await api<User>('users', Object.fromEntries(new FormData(userForm)));
    userForm.reset();
    $('user-message').textContent = 'Cuenta creada para ' + account.email + '.';
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) showLogin(error.message);
    else $('user-message').textContent = message(error);
  } finally {
    button.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    await api('logout', {});
    showLogin('Sesión cerrada.');
  } catch (error) {
    $('logout-message').textContent = message(error);
  } finally {
    logout.disabled = false;
  }
});

window.addEventListener('hashchange', navigate);
refresh.addEventListener('click', () => void load());
scenario.addEventListener('change', () => void load(true));
metric.addEventListener('change', draw);
api<User>('me').then(showDashboard).catch(error => {
  showLogin(error instanceof ApiError && error.status === 401 ? '' : message(error));
});
setInterval(() => void load(), 3000);
