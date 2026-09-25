-- Rodar UMA VEZ no SQL Editor do Neon, depois de criar o banco.
-- Idempotente: pode rodar de novo sem quebrar.

CREATE TABLE IF NOT EXISTS bookings (
  id            BIGSERIAL PRIMARY KEY,
  slot_date     DATE        NOT NULL,
  slot_hour     SMALLINT    NOT NULL,
  student_name  TEXT        NOT NULL,
  grade         TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  topic         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ
);

-- Indice PARCIAL: garante uma reserva por horario e, ao mesmo tempo, permite
-- que o cancelamento devolva o horario a grade sem apagar o historico.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_unique
  ON bookings (slot_date, slot_hour)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings (slot_date);

CREATE TABLE IF NOT EXISTS blocked_slots (
  slot_date  DATE        NOT NULL,
  slot_hour  SMALLINT    NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (slot_date, slot_hour)
);
