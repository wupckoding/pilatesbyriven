# App de iPhone: do código à App Store

O app de iPhone é o mesmo app web, empacotado com **Capacitor**. As telas ficam dentro do app, e a API é a do servidor publicado (`https://app.pilatesbyriven.com`).

**Já está pronto no repositório:**
- Projeto do Xcode em `ios/`, com bundle ID `com.pilatesbyriven.app`, só iPhone, só retrato e idioma espanhol.
- Ícone 1024 px e tela de arranque igual ao primeiro quadro da abertura animada. Para gerar de novo: `node scripts/make-ios-assets.mjs`.
- "Continuar con Apple" e "Continuar con Google" nativos. A Apple exige o seu login quando o app oferece o do Google (regra 4.8).
- Servidor aceita o login da Apple (`POST /api/auth/apple`) e o Google vindo do app. O CORS libera `capacitor://localhost`.
- Excluir a conta pelo app (regra 5.1.1), com revogação do acesso na Apple quando a chave `.p8` está configurada.
- Textos de permissão de câmera e fotos, para o comprovante SINPE.
- Exportações e comprovantes do painel abrem a folha de compartilhar do iOS.
- Páginas públicas que a App Store pede:
  - privacidade: https://app.pilatesbyriven.com/privacidad
  - suporte: https://app.pilatesbyriven.com/soporte
- Declaração de criptografia (`ITSAppUsesNonExemptEncryption = false`): o app não pergunta isso a cada envio.

**Cuidado:** as telas do iPhone vão dentro do app. Mudar o front exige mandar uma versão nova para a Apple; mudar só o servidor, não.

---

## 1. Conta de desenvolvedor da Apple (antes de tudo)

Inscrição em https://developer.apple.com/programs/enroll. Custa US$99 por ano; a aprovação leva de 1 a 2 dias, ou mais no caso de empresa.

**Em nome de quem:**
- **Recomendado:** em nome do estúdio (ou da Riven), e você entra como usuário com acesso.
  - Na App Store, o vendedor que aparece é o dono da conta.
  - Se o estúdio tem empresa registrada, inscreva como **Organization**. Precisa do número D-U-N-S, que é gratuito e pode levar alguns dias.
  - Sem empresa, inscreva como **Individual** em nome da Riven.
- Depois, em App Store Connect › Usuários e acesso, a dona convida você como **Admin**. Assim você compila e envia sem usar a senha dela.
- **Evite** publicar na sua conta pessoal: transferir o app para a cliente depois é burocrático.

## 2. Preparar o Mac (uma vez)

1. Instale o **Xcode** pela Mac App Store e abra uma vez para aceitar a licença.
2. Instale o **Node 20+**, pelo site nodejs.org ou com `brew install node`.
3. Baixe o projeto:
   ```bash
   git clone https://github.com/wupckoding/pilatesbyriven.git
   cd pilatesbyriven
   npm install
   ```
4. Compile e abra no Xcode:
   ```bash
   npm run build:ios
   npm run ios
   ```

## 3. No Xcode

1. No painel da esquerda, clique em **App** (ícone azul) › alvo **App** › aba **Signing & Capabilities**.
2. Em **Team**, escolha a conta do item 1. "Automatically manage signing" fica marcado.
3. Confira se aparece a capacidade **Sign in with Apple**. Ela já vem do arquivo `App.entitlements`; se não aparecer, adicione com "+ Capability".
4. Escolha um simulador de iPhone e clique em ▶ para testar. Para testar no seu iPhone, conecte o cabo e escolha o aparelho.

> O "Iniciar sessão com a Apple" só funciona num iPhone de verdade, ou num simulador com Apple ID logado, e depois que o servidor publicado tiver esta versão (item 6).

## 4. Google no app (opcional, mas recomendado)

Sem isto, o app sai com e-mail/senha e Apple, e o botão do Google simplesmente não aparece.

1. Em console.cloud.google.com › APIs e serviços › Credenciais, crie um **ID do cliente OAuth** do tipo **iOS** com o bundle ID `com.pilatesbyriven.app`.
2. Preencha `.env.native` na raiz do projeto:
   - `VITE_GOOGLE_IOS_CLIENT_ID`: o ID iOS do passo 1.
   - `VITE_GOOGLE_WEB_CLIENT_ID`: o ID web (o mesmo `GOOGLE_CLIENT_ID` do servidor).
3. Em `ios/App/App/Info.plist`, troque `com.googleusercontent.apps.REEMPLAZAR` pelo **ID iOS ao contrário**. O Google mostra esse valor como "iOS URL scheme".
4. No servidor, em `/opt/pilates/.env`, coloque `GOOGLE_IOS_CLIENT_ID=` com o ID iOS e reinicie o app.
5. Rode `npm run build:ios` de novo.

## 5. Revogação da Apple ao excluir conta (recomendado)

1. Em developer.apple.com › Certificates, IDs & Profiles › **Keys**, crie uma chave com **Sign in with Apple** marcado e baixe o `.p8`. Ele só pode ser baixado uma vez: guarde bem.
2. No `/opt/pilates/.env` da VPS, coloque:
   - `APPLE_TEAM_ID`: o Team ID, que aparece no canto da conta.
   - `APPLE_KEY_ID`: o ID da chave.
   - `APPLE_PRIVATE_KEY`: o conteúdo do `.p8` entre aspas simples, com `\n` no lugar das quebras de linha.

## 6. Publicar o servidor desta versão

O app depende de três coisas novas do servidor: a rota da Apple, o CORS do app e as páginas públicas. Publique antes de mandar para revisão:

```bash
bash deploy/publish.sh pilates-vps
```

## 7. App Store Connect (cadastro do app)

Em https://appstoreconnect.apple.com › Apps › **+** › Novo app:
- Plataforma: iOS
- Nome: **Pilates by Riven**
- Idioma principal: espanhol (México ou Espanha)
- Bundle ID: `com.pilatesbyriven.app`
- SKU: `pilatesbyriven-ios`

**Informações do app:**

| Campo | Valor |
|---|---|
| Categoria | Saúde e fitness |
| URL da política de privacidade | https://app.pilatesbyriven.com/privacidad |
| URL de suporte | https://app.pilatesbyriven.com/soporte |
| Classificação etária | 4+ (sem conteúdo sensível) |

**Privacidade do app (questionário):** marque que o app coleta os dados abaixo, todos **vinculados à pessoa** e **não usados para rastreamento**, com a finalidade "Funcionalidade do app":

| Dado | Por quê |
|---|---|
| Nome, e-mail e telefone | Conta e contato por WhatsApp |
| Informações de saúde | Formulário de admissão |
| Fotos (comprovante de pagamento) | Conferir o pagamento SINPE |
| Histórico de compras | Pacotes e pagamentos |
| ID do usuário | Conta |

**Capturas de tela:** a Apple exige as do iPhone 6,9" (1320 × 2868). Elas ficam em `docs/app-store/`.

**Notas para a revisão.** A Apple precisa entrar no app:
- Crie no app publicado uma conta de clienta só para a revisão, com e-mail e senha.
- Coloque o e-mail e a senha em "Informações de login".
- Explique numa linha: *"Las clases y paquetes son servicios presenciales del estudio; el pago es por SINPE Móvil fuera del app (guía 3.1.3(e))."*

## 8. Enviar

1. No Xcode, escolha o destino **Any iOS Device (arm64)**.
2. Menu **Product › Archive**. Quando terminar, clique em **Distribute App › App Store Connect › Upload**.
3. Em 10 a 30 minutos, a versão aparece no App Store Connect, na aba **TestFlight**.
   - Instale pelo app TestFlight no seu iPhone e no da cliente, e testem antes de enviar.
4. Na página da versão, escolha o build, preencha o que falta e clique em **Enviar para revisão**. A revisão costuma levar de 1 a 3 dias.

Para cada versão nova:
1. Aumente o **Build** (e a **Version**, se quiser) no alvo App › General.
2. Rode `npm run build:ios`.
3. Faça Product › Archive de novo.

## 9. O que pode levar à recusa, e como evitar

| Risco | Situação |
|---|---|
| Textos com "Borrador" (privacidade e consentimento) | **Resolver antes de enviar.** A Apple recusa conteúdo marcado como provisório, e o app guarda dados de saúde. Finalize a revisão jurídica e tire o aviso de `PrivacyNotice` e do consentimento. |
| "É só um site" (regra 4.2) | Mitigado: login nativo de Apple e Google, folha de compartilhar, câmera para comprovante, arranque nativo, aviso sem conexão. |
| Pagamento fora da Apple (regra 3.1) | Permitido: aulas são serviço presencial (3.1.3(e)). Não ofereça conteúdo digital pago no app. |
| Login da Apple obrigatório (4.8) | Feito. |
| Excluir conta (5.1.1(v)) | Feito, em Perfil › Eliminar mi cuenta. |
| Conta de teste que não funciona | Teste o login da conta de revisão no app publicado no mesmo dia do envio. |
