# Deployment Guide (Raspberry Pi / Mini PC)

## 1. Requisitos
- Node.js 20+ (LTS recomendado).
- `npm` disponible.
- Puerto USB del relay identificado.
- Sistema operativo con zona horaria `America/Monterrey`.

## 2. Instalacion
```powershell
npm install
Copy-Item .env.example .env
npm run prisma:migrate
npm run prisma:generate
npm run prisma:seed
```

## 3. Arranque en produccion
```powershell
npm run build
npm run start
```

## 4. Verificaciones de salida
- Abrir `http://localhost:3000`.
- Validar banner de relay conectado (mock o serial).
- Activar una maquina en mock mode y revisar countdown.
- Esperar expiracion y confirmar que transaccion pasa a `completed`.

## 5. Reconexion serial
- Ir a `Configuracion`.
- Capturar puerto (`COMx` o `/dev/ttyUSB0`) y baud rate.
- Desactivar modo simulador.
- Ejecutar `Reconectar relay`.
