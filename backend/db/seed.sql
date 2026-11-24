START TRANSACTION;

INSERT INTO sensors VALUES
  ('temperature', 'Temperatura', 'Ambiente interior', 'Ambiente interior', '°C', 35, 50, 1),
  ('air', 'Calidad del aire', 'Índice de calidad del aire', 'Ambiente interior', 'AQI', 100, 150, 2),
  ('gas', 'Concentración de gas', 'Gas combustible · simulación', 'Ambiente interior', 'ppm', 500, 1000, 3)
ON DUPLICATE KEY UPDATE id = sensors.id;

INSERT INTO scenarios VALUES
  ('normal', 'Ambiente normal', 1),
  ('warning', 'Simular precaución', 2),
  ('critical', 'Simular riesgo alto', 3)
ON DUPLICATE KEY UPDATE id = scenarios.id;

INSERT INTO readings (scenario_id, measured_at, sensor_id, value)
WITH RECURSIVE minutes AS (
  SELECT 0 AS n
  UNION ALL SELECT n + 1 FROM minutes WHERE n < 23
), baselines AS (
  SELECT 'normal' AS scenario_id, 'temperature' AS sensor_id, 24 AS baseline, 1.8 AS variation
  UNION ALL SELECT 'normal', 'air', 34, 6
  UNION ALL SELECT 'normal', 'gas', 120, 20
  UNION ALL SELECT 'warning', 'temperature', 39, 1.8
  UNION ALL SELECT 'warning', 'air', 115, 6
  UNION ALL SELECT 'warning', 'gas', 650, 20
  UNION ALL SELECT 'critical', 'temperature', 58, 1.8
  UNION ALL SELECT 'critical', 'air', 190, 6
  UNION ALL SELECT 'critical', 'gas', 1400, 20
)
SELECT b.scenario_id, DATE_ADD('2026-01-01 12:00:00', INTERVAL m.n MINUTE),
       b.sensor_id, ROUND(b.baseline + SIN(m.n * 0.65) * b.variation, 1)
FROM baselines b CROSS JOIN minutes m
WHERE TRUE
ON DUPLICATE KEY UPDATE value = readings.value;

COMMIT;
