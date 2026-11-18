# Servidor local de testes e reserva

Servidor preparado em 18/11/2026 com as correções do commit 0d59297 e conversão
de quebras de linha do entrypoint no Dockerfile para permitir build no Windows.
A imagem oficial ghcr.io/usuariodejava/web-screen-share:latest também foi baixada.

## Acessar

- Neste PC: https://localhost:3100/
- Rede local: https://192.168.0.116:3100/ (o IP pode mudar).
- Tailscale: https://100.81.170.116:3100/

O certificado local é autoassinado: o navegador pode pedir confirmação na primeira
visita. No aplicativo, use Configurações > Conexão e testes para trocar o servidor
por https://localhost:3100/ e reiniciar/aplicar. Outros participantes devem usar
o endereço da rede local ou do Tailscale, nunca localhost.

Estes endereços foram verificados a partir deste PC. O acesso de outro dispositivo
depende da conectividade, das regras do Tailscale e do firewall do Windows.

## Operar

Abra o Docker Desktop antes de iniciar. Nesta pasta:

- iniciar.cmd: inicia o servidor já compilado, sem precisar baixar novamente.
- parar.cmd: para o servidor, preservando os dados.
- logs.cmd: acompanha o log (Ctrl+C encerra apenas a visualização).

O container usa restart: unless-stopped: volta quando o mecanismo Docker reinicia,
exceto se foi parado manualmente. Para iniciar com o Windows, habilite a opção de
iniciar o Docker Desktop ao entrar na sessão. O PC precisa permanecer ligado.

Para recompilar o código do checkout, execute na raiz do projeto:

```powershell
docker compose -f local-server/compose.yaml up -d --build
```

Dados e certificado ficam no volume Docker wss-local_server-data; a imagem local
fica no Docker Desktop. Não use down -v nem exclua esse volume se quiser preservar
os dados. O log do container tem rotação de 3 arquivos de até 10 MB.

## Usar como reserva

Se o servidor principal cair, todos devem mudar para o mesmo endereço deste PC.
A troca é manual. Esta é uma sala independente: não replica usuários, transmissões,
mensagens ou dados do servidor principal. As transmissões precisam ser iniciadas
novamente. Nenhuma configuração do servidor principal foi alterada.

Foram verificados HTTPS, versão, status, scripts compartilhados e handshake
Socket.IO; TURN e MediaMTX iniciaram. Transmissão real entre PCs e OBS ainda
precisam ser testados com os participantes.
