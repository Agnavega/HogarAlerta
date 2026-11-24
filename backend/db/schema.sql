CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash BINARY(32) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensors (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(160) NOT NULL,
  location VARCHAR(100) NOT NULL,
  unit VARCHAR(12) NOT NULL,
  warning_threshold DECIMAL(10,2) NOT NULL,
  critical_threshold DECIMAL(10,2) NOT NULL,
  display_order INT NOT NULL,
  CHECK (warning_threshold < critical_threshold)
);

CREATE TABLE IF NOT EXISTS scenarios (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS readings (
  scenario_id VARCHAR(32) NOT NULL,
  measured_at DATETIME NOT NULL,
  sensor_id VARCHAR(32) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (scenario_id, measured_at, sensor_id),
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id),
  FOREIGN KEY (sensor_id) REFERENCES sensors(id)
);
