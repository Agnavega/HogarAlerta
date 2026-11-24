export async function snapshot(db, requestedScenario) {
  const [scenarios] = await db.query('SELECT id, name FROM scenarios ORDER BY display_order, id');
  const scenario = requestedScenario || scenarios[0]?.id;
  if (!scenarios.some(option => option.id === scenario)) {
    if (!scenarios.length) throw Object.assign(new Error('No hay escenarios configurados.'), { status: 503 });
    throw Object.assign(new Error('Escenario inválido.'), { status: 400 });
  }

  const [sensors] = await db.query(`
    SELECT id, name, description, location, unit, warning_threshold AS warningThreshold,
           critical_threshold AS criticalThreshold
    FROM sensors ORDER BY display_order, id
  `);
  const [rows] = await db.execute(`
    SELECT measured_at AS timestamp, sensor_id AS sensorId, value
    FROM readings
    WHERE scenario_id = ? AND measured_at >= (
      SELECT MIN(latest.measured_at) FROM (
        SELECT DISTINCT measured_at FROM readings WHERE scenario_id = ?
        ORDER BY measured_at DESC LIMIT 24
      ) latest
    )
    ORDER BY measured_at, sensor_id
  `, [scenario, scenario]);

  const samples = new Map();
  for (const { timestamp, sensorId, value } of rows) {
    const key = timestamp.toISOString();
    if (!samples.has(key)) samples.set(key, Object.create(null));
    samples.get(key)[sensorId] = value;
  }
  const history = Array.from(samples, ([timestamp, values]) => ({ timestamp, values }));
  const latest = history.at(-1);
  const configuredSensors = sensors.map(sensor => {
    const value = history.findLast(sample => Object.hasOwn(sample.values, sensor.id))?.values[sensor.id] ?? null;
    return { ...sensor, value, status: sensorStatus(sensor, value) };
  });

  const activity = [];
  let previous;
  for (const sample of history) {
    const state = overallStatus(sensors.map(sensor => sensorStatus(sensor, sample.values[sensor.id])));
    if (state !== previous) activity.push({ timestamp: sample.timestamp, state });
    previous = state;
  }
  return {
    simulated: true, timestamp: latest?.timestamp ?? null, scenario, scenarios, sensors: configuredSensors,
    state: overallStatus(configuredSensors.map(sensor => sensor.status)), history, activity: activity.reverse()
  };
}

function sensorStatus(sensor, value) {
  if (value == null) return 'empty';
  if (value >= sensor.criticalThreshold) return 'critical';
  if (value >= sensor.warningThreshold) return 'warning';
  return 'normal';
}

function overallStatus(states) {
  return ['critical', 'warning', 'normal'].find(state => states.includes(state)) || 'empty';
}
