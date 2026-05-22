# Punto Lavado POS

Sistema local-first para lavanderia atendida, construido con Next.js + TypeScript + SQLite (Prisma), siguiendo [`North_star.md`](./North_star.md).

## Stack
- Next.js (App Router) + TypeScript
- SQLite + Prisma
- Tailwind CSS
- Relay USB serial (`serialport`) + simulador

## Quick Start
```powershell
npm install
Copy-Item .env.example .env
npm run prisma:migrate
npm run prisma:generate
npm run prisma:seed
npm run dev
```

## Comandos
- `npm run dev` desarrollo
- `npm run build` build produccion
- `npm run start` servidor produccion
- `npm run test` tests unitarios
- `npm run test:e2e` tests e2e

## Cobertura funcional implementada
- Panel principal de maquinas (disponible/running/fuera de servicio)
- Activacion con orden critico: DB antes de relay
- Scheduler server-side para expiracion y apagado relay
- Recovery al reiniciar para timers/transacciones activas
- Agregar tiempo a transacciones activas
- Apertura/cierre de turno, movimientos de caja y calculo de esperado vs real
- Reportes con resumen, utilizacion y export CSV
- Configuracion basica de maquinas, empleados, serial y modo simulador

## Operacion y despliegue
- Ver [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
- Ver [`docs/RUNBOOK.md`](./docs/RUNBOOK.md)
