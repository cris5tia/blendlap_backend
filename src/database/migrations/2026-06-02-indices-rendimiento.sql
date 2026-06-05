-- Índices para acelerar las queries más usadas

-- findByCliente: WHERE r.id_cliente = ?
ALTER TABLE reserva ADD INDEX IF NOT EXISTS idx_reserva_cliente (id_cliente);

-- findByBarbero / getCitasHoy: WHERE r.id_barbero = ? AND r.fecha = ?
ALTER TABLE reserva ADD INDEX IF NOT EXISTS idx_reserva_barbero_fecha (id_barbero, fecha);

-- JOIN reserva_servicio ON r.id_reserva = rs.id_reserva
ALTER TABLE reserva_servicio ADD INDEX IF NOT EXISTS idx_rs_reserva (id_reserva);

-- JOIN resena ON re.id_reserva = r.id_reserva
ALTER TABLE resena ADD INDEX IF NOT EXISTS idx_resena_reserva (id_reserva);

-- getDisponibilidad: WHERE id_barbero = ? AND fecha = ?
ALTER TABLE reserva ADD INDEX IF NOT EXISTS idx_reserva_barbero_estado (id_barbero, fecha, estado);

-- horario_excepcion: WHERE id_usuario = ? AND dia_semana = ?
ALTER TABLE horario_excepcion ADD INDEX IF NOT EXISTS idx_excepcion_usuario_dia (id_usuario, dia_semana);
