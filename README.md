# WSS Câmera (Android)

App Android que usa a câmera do celular como uma transmissão da sala do
[Web Screen Share](https://github.com/UsuarioDeJava/web-screen-share), do mesmo jeito que o OBS:
o celular manda o vídeo pro **app do PC** pela rede local, e o app do PC publica na sala com
as suas credenciais. A transmissão aparece na sua linha da sala.

## Usar

1. Instale o `WSS-Camera-*.apk` do release (no celular: permitir instalar de fontes desconhecidas).
2. No app do PC, entre na sala e abra **Configurações → Conexão e testes → Conectar câmera**.
3. No celular: **Ler QR code**, ou digite só o IP do PC e aceite no PC.
4. **Transmitir**.

Celular e PC precisam estar no mesmo Wi-Fi/rede. A tela do celular fica ligada durante a
transmissão; se o app sair da tela, a transmissão para.

## Build

```sh
./gradlew assembleRelease            # app/build/outputs/apk/release/app-release.apk
./gradlew assembleRelease -PappVersion=2.4.0
```

O GitHub Actions (`.github/workflows/android.yml`) gera o APK a cada push nesta branch e
pode ser chamado pelo release do `main` pra anexar o APK.

Assinatura: por padrão usa `app/camera.keystore` (fixa, pra atualizar por cima). Pra usar
uma chave própria, crie os secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD` (trocar a chave exige desinstalar o app antigo uma vez).

O que o app do PC precisa implementar: [PROTOCOLO.md](PROTOCOLO.md).
