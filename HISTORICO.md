# Histórico do projeto

App do estúdio Pilates by Riven (Escazú, Costa Rica): reservas para as clientas e painel de administração.
Requisitos: documento "Requisitos App Pilates by Riven" entregue pela cliente.

## 11/11/2026

**Base.** Partimos do app original (PWA React + Express + SQLite).

**Fase 1: fundação.**
- Banco migrado para PostgreSQL 17, com modelo de dados novo e migrações versionadas.
- API protegida: senhas com scrypt, JWT, papéis (admin, instrutora, clienta), validação com zod, limites de tentativas.
- Design system próprio. Agenda, reservas com trava do último cupo, fichas de clientas.
- Layouts de computador (1440 px): agenda em colunas, tabela de clientas, telas da clienta em duas colunas.

**Fase 2: dinheiro.**
- Pacotes e créditos, renovações com retenção de vaga.
- Pagamentos parciais, por verificar e reembolsos, em USD e CRC.
- Caja e fundo Lindora, exportação CSV.

**Fase 3: admissão e compra.**
- Formulário de admissão e consentimento. As respostas de saúde são criptografadas (AES-256-GCM) e só o admin as lê, com registro de acesso.
- Compra pela própria clienta, comprovante SINPE, link de pagamento por ordem.

**Testes de carga e de interface.**
- Simulação de 1000 usuárias simultâneas, com 17 regras de negócio conferidas no banco. Corrigido o que ela encontrou.
- Testes Playwright em computador e celular. Corrigido o que eles encontraram.

**Arquivos de publicação.** Docker, Caddy (HTTPS automático), backup e restauração.

## 12/11/2026

**Publicação.**
- App no ar em https://app.pilatesbyriven.com (VPS Hostinger).
- Backup diário às 09:00 UTC; restauração ensaiada; portas internas fechadas por fora.
- Conta de administração criada (contacto@pilatesbyriven.com).
- Corrigidos dois defeitos dos scripts de publicação: liam a entrada padrão quando rodados por SSH; e agora é possível subir sem o proxy antes de o DNS apontar.

**Proteção contra spam no cadastro.**
- Confirmação de e-mail por código de 6 dígitos: vale 15 minutos e aceita 5 tentativas. Para reenviar, é preciso esperar 60 s, até 6 vezes por dia.
- A ficha e o número da clienta só são criados depois da confirmação; contas não confirmadas são apagadas em 48 h.
- Entrada com Google. O servidor verifica o token junto ao Google, pede WhatsApp e aceite de privacidade no primeiro acesso e liga a conta a uma já existente com o mesmo e-mail.
- Contas só com Google podem criar uma senha e excluir a conta digitando ELIMINAR.
- **Estado:** pronto, mas desligado em produção até configurar o SMTP e o client ID do Google (ver `deploy/README.md`, seção 7).

**Abertura animada e testes com agentes.**
- Abertura da marca restaurada e refeita: as letras de RIVEN sobem, uma linha se traça e uma cortina revela o app.
  - Dura uns 3 s na primeira visita e 2 s nas seguintes; um toque pula.
  - Durante o carregamento já aparece o fundo da marca.
- Entrada dos blocos em sequência, transição entre abas e indicador de aba que desliza.
- Check animado ao concluir a admissão e ao reservar; o campo de código treme quando o código está errado.
- Três agentes usaram o app como pessoas reais: clienta nova, clienta apressada com rede ruim e a dona no painel. Corrigido o que encontraram:
  - "12,50" virava US$1.250 nos campos de dinheiro.
  - O filtro de admissão do painel dava erro 500.
  - Pagamento acima do saldo era aceito sem aviso.
  - O login bloqueava pessoas legítimas.
  - Sem rede, ações travavam e disparavam sozinhas depois.
  - Reembolsos saíam como texto no CSV.
  - A "próxima data" da reserva saía errada.
  - A busca não ignorava acentos.
  - Algumas mensagens de erro saíam em inglês.
  - Datas de nascimento absurdas eram aceitas.
  - Um emoji no nome quebrava o avatar.
  - O rascunho da admissão se perdia ao recarregar.
  - Dois tons de texto tinham contraste baixo.
- Testes: 67 no servidor, 40 de interface. Tudo publicado na VPS.

## 26/11/2026

**App de iPhone (preparação para a App Store).**
- Projeto iOS com Capacitor em `ios/`:
  - Bundle `com.pilatesbyriven.app`, só iPhone e só retrato.
  - Ícone, tela de arranque da marca, permissões de câmera e fotos para o comprovante.
- "Continuar con Apple" (exigido pela Apple quando há Google) e "Continuar con Google" nativos no app.
  - O servidor valida os tokens da Apple e aceita o ID de cliente iOS do Google.
  - Ao excluir a conta, o acesso na Apple é revogado (quando a chave `.p8` estiver configurada).
- O CORS do servidor libera o app (`capacitor://localhost`).
- Páginas públicas `/privacidad` e `/soporte`, exigidas pela App Store.
- No iPhone, exportações e comprovantes abrem a folha de compartilhar.
- Capturas no tamanho da App Store (1320 × 2868) em `docs/app-store/`; roteiro completo em `docs/APP_STORE.md`.
- Corrigido um teste que falhava à noite (usava a data UTC em vez da da Costa Rica).
- Testes: 76 no servidor, 40 de interface.
- **Falta (no Mac):** conta Apple Developer, compilar no Xcode, cadastro no App Store Connect e envio. Antes disso, publicar o servidor desta versão.

## Pendências

**Do lado da cliente ou do desenvolvedor:**
- Configurar SMTP no `/opt/pilates/.env` da VPS (liga a confirmação de e-mail).
- Criar o client ID do Google OAuth (liga a entrada com Google).
- Guardar uma cópia da `INTAKE_KEY` fora do servidor.
- Ter backups fora da VPS.
- Revisão jurídica dos textos de privacidade e consentimento (hoje marcados como "Borrador").
- Configurar ajustes, preços e grupos no painel.

**Melhorias apontadas pelos agentes, ainda não feitas:**
- **Reserva e pagamento:**
  - A confirmação da reserva não diz que falta pagar nem quanto.
  - O SINPE mostra o valor só em dólares.
  - Dá para reservar sem a admissão, e só depois de confirmar aparece o aviso.
- **Formulários:**
  - O cadastro valida um campo por vez.
  - O telefone de emergência aceita texto.
- **Navegação no celular:**
  - O botão Voltar do Android não fecha folhas abertas.
  - Faltam aviso de sessão expirada, confirmação ao sair e nova tentativa automática quando a rede volta.
- **Agenda do painel:**
  - Os cartões não mostram nomes.
  - "Mover" usa uma lista longa.
  - Uma aula nova não leva à sua semana.
- **Pagamentos no painel:**
  - O botão de reembolso continua visível em pagamentos já reembolsados.
  - O valor de "Cobros" no Inicio é bruto, enquanto o de Pagos é líquido.
- **Celular:**
  - Alguns textos e áreas de toque são pequenos.
  - Na folha de pacote, o botão de pagamento fica abaixo da dobra.
- **Desempenho:** o pacote JavaScript não é dividido por tela.

**Próximas etapas:**
- Recuperação de senha por e-mail.
- App para iPhone: compilar no Mac e enviar à App Store (ver docs/APP_STORE.md).
