-- Agrega 'rechazado' al ENUM del campo estado en la tabla credito
ALTER TABLE credito
  MODIFY COLUMN estado
    ENUM('pendiente', 'activo', 'pagado', 'vencido', 'rechazado')
    DEFAULT 'pendiente';
