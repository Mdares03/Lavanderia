# Deployment Guide (Linux Server / Mini PC)

## 1. Requisitos del sistema
- Ubuntu/Debian con `systemd`.
- Node.js 20+ (recomendado: LTS actual).
- `git`, `curl`, `build-essential`, `python3`, `make`, `g++`.
- Usuario de ejecucion con acceso al puerto serial (`dialout` en Linux).
- Zona horaria del OS: `America/Monterrey`.

Comandos sugeridos de preparacion del servidor:
```bash
sudo apt update
sudo apt install -y git curl build-essential python3 make g++
sudo timedatectl set-timezone America/Monterrey
sudo usermod -aG dialout mdares
```

Nota: despues de `usermod`, cerrar sesion y volver a entrar para aplicar el grupo.

## 2. Preparar proyecto
```bash
cd /home/mdares/system
cp -n .env.example .env
```

Configura token compartido para gestion de mapeo Node-RED:
- En `/home/mdares/Laundry/.env` define `RELAY_ADMIN_TOKEN=<token-fuerte>`.
- En `/home/mdares/.node-red/environment` define el mismo valor:
  `RELAY_ADMIN_TOKEN=<token-fuerte>`.
- Reinicia `nodered.service` y `lavanderia.service` despues del cambio.

## 3. Instalar dependencias y base de datos
```bash
npm ci
npm run prisma:migrate:deploy
npm run prisma:generate
npm run prisma:seed
```

## 4. Build y prueba local de produccion
```bash
npm run build
npm run start
```

## 5. Servicio systemd (autostart)
Archivo de ejemplo: `deploy/system.service`

```bash
sudo cp /home/mdares/system/deploy/system.service /etc/systemd/system/system.service
sudo systemctl daemon-reload
sudo systemctl enable --now system.service
sudo systemctl status system.service
```

Comandos utiles:
```bash
sudo systemctl restart system.service
sudo journalctl -u system.service -f
```

## 6. Verificaciones de salida
- Abrir `http://localhost:3000`.
- Confirmar API de salud: `curl -fsS http://127.0.0.1:3000/api/system/relay`.
- Validar relay en `Configuracion > Serial / Relay`.
- Activar una maquina en mock mode y revisar countdown.
- Esperar expiracion y confirmar que la transaccion pasa a `completed`.

## 7. Reconexion serial
- Ir a `Configuracion > Serial / Relay`.
- Capturar puerto (`/dev/ttyUSB0` o similar) y baud rate.
- Desactivar modo simulador.
- Ejecutar `Reconectar relay`.
