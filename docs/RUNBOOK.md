# Offline Operations Runbook

## Inicio diario
1. Encender equipo local.
2. Ejecutar `npm run start` (o servicio equivalente).
3. Entrar al POS con PIN.
4. Abrir turno con efectivo inicial.

## Operacion normal
1. Seleccionar maquina disponible.
2. Confirmar importe, tiempo y metodo de pago.
3. Verificar que el estado cambie a `running`.

## Incidencias
### Relay desconectado
1. Revisar cable USB y alimentacion.
2. Ir a `Configuracion > Serial / Relay`.
3. Ejecutar `Reconectar relay`.
4. Si falla, activar `Modo simulador` temporalmente para seguir cobrando y registrar manualmente encendidos.

### Reinicio inesperado
1. Reiniciar aplicacion.
2. Validar que timers activos fueron recuperados.
3. Confirmar que transacciones vencidas quedaron en `completed`.

## Corte de caja
1. En `Corte`, registrar depositos/retiros con motivo.
2. Capturar efectivo contado al cierre.
3. Ejecutar `Cerrar Turno`.
4. Descargar CSV de reportes si se requiere respaldo manual.

## Respaldo
- Respaldar archivo SQLite (`prisma/dev.db`) al cierre del dia en USB o carpeta segura.
