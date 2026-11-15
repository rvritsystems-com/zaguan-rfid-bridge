# Instalar el puente como servicio (Raspberry Pi OS / Debian / Ubuntu)

Con esto el puente arranca solo al encender el equipo y se reinicia si se cae.

1. **Node 18 o más nuevo**: `node -v`. Si no está, instalarlo (por ejemplo con NodeSource) y ver su ruta con `which node`; si no es `/usr/bin/node`, ajustar `ExecStart` en el archivo .service.
2. **Usuario y carpeta**
   ```
   sudo useradd --system --home /opt/zaguan-rfid-bridge zaguan
   sudo mkdir -p /opt/zaguan-rfid-bridge
   sudo cp -r bridge.js lib package.json /opt/zaguan-rfid-bridge/
   sudo chown -R zaguan: /opt/zaguan-rfid-bridge
   ```
3. **Configuración**
   ```
   sudo cp deploy/zaguan-rfid-bridge.env.example /etc/zaguan-rfid-bridge.env
   sudo chmod 600 /etc/zaguan-rfid-bridge.env      # lleva el código del dispositivo
   sudo nano /etc/zaguan-rfid-bridge.env
   ```
4. **Probar antes de instalar el servicio**: `node probe.js <ip-del-lector>` debe mostrar firmware, IP, potencia y las etiquetas que acerques.
5. **Activar el servicio**
   ```
   sudo cp deploy/zaguan-rfid-bridge.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now zaguan-rfid-bridge
   ```
6. **Ver que está vivo**: `systemctl status zaguan-rfid-bridge` y `journalctl -u zaguan-rfid-bridge -f` (debe decir «lector conectado …» y mostrar «lectura nueva» al pasar una etiqueta).
7. **Prueba de reinicio**: `sudo systemctl kill -s KILL zaguan-rfid-bridge` → a los 5 s vuelve solo. Y desconecta y reconecta el lector: el puente lo recupera sin intervención.

## Para que sobreviva a cortes de luz e internet
- **Encendido automático**: la Raspberry Pi arranca al volver la luz. En una mini PC, activar en la BIOS «Restore on AC power loss / Power On».
- **No-break (UPS)** para lector, Pi y módem: evita reinicios por microcortes durante la salida.
- **Reloj**: la Pi no trae reloj con pila; necesita internet al arrancar para poner la hora (systemd-timesyncd lo hace solo: `timedatectl` debe decir «System clock synchronized: yes»). Las lecturas llevan su hora.
- **Bitácora persistente** (opcional): `sudo mkdir -p /var/log/journal && sudo systemctl restart systemd-journald`.
- **Actualizar el puente**: copiar los archivos nuevos a `/opt/zaguan-rfid-bridge` y `sudo systemctl restart zaguan-rfid-bridge`.
