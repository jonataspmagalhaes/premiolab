# Iniciar Desenvolvimento

Inicia o servidor Expo via Tailscale e monitoramento de logs:

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=100.64.176.123 npx expo start 2>&1 | tee /tmp/expo.log &
```
