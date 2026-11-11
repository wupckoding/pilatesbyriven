<<<<<<< HEAD
# pilatesbyriven
=======
# Pilates by Riven — App PWA

App progressivo (PWA) do studio **Pilates by Riven**. Os alunos podem adicionar à tela inicial do celular e usar como um app nativo, sem precisar da App Store.

## Stack

- **React 18** + **Vite 6** (build rápido)
- **Tailwind CSS 3** (estilização)
- **Framer Motion** (animações)
- **PWA** com Service Worker (funciona offline)

## Rodar localmente

```bash
# Instalar dependências
npm install

# Rodar em modo dev
npm run dev
# → acesse http://localhost:3000

# Build de produção
npm run build

# Preview da build
npm run preview
```

## Deploy na VPS

```bash
# 1. Tornar o script executável
chmod +x deploy.sh

# 2. Rodar o deploy (substitua com seus dados)
./deploy.sh root@123.456.789.0
```

### Setup manual na VPS (se preferir)

```bash
# No servidor (Ubuntu/Debian)
sudo apt update && sudo apt install nginx -y

# Criar pasta do site
sudo mkdir -p /var/www/pilates-by-riven

# Na sua máquina: build + enviar
npm run build
scp -r dist/* root@seu-servidor:/var/www/pilates-by-riven/

# Copiar config nginx
scp nginx.conf root@seu-servidor:/etc/nginx/sites-available/pilates-by-riven
ssh root@seu-servidor "ln -sf /etc/nginx/sites-available/pilates-by-riven /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"

# SSL gratuito com Let's Encrypt
ssh root@seu-servidor "apt install certbot python3-certbot-nginx -y && certbot --nginx -d seu-dominio.com.br"
```

## Estrutura

```
src/
├── main.jsx              # Ponto de entrada
├── App.jsx               # App principal
├── index.css             # Estilos globais + Tailwind
└── components/
    ├── InaugurationBanner.jsx  # Banner de inauguração com countdown
    ├── Navbar.jsx              # Menu responsivo
    ├── Hero.jsx                # Tela principal
    ├── About.jsx               # Sobre o studio + benefícios
    ├── Classes.jsx             # Modalidades + horários
    ├── Instructor.jsx          # Perfil da instrutora
    ├── Gallery.jsx             # Galeria de fotos (placeholders)
    ├── Pricing.jsx             # Planos e preços
    ├── Contact.jsx             # Formulário + WhatsApp
    ├── Footer.jsx              # Rodapé
    └── InstallPrompt.jsx       # Prompt para instalar PWA
```

## Personalizar

- **WhatsApp**: Trocar `5500000000000` pelo número real em `Contact.jsx` e `Footer.jsx`
- **Instagram**: Trocar `@pilatesbyriven` se for diferente
- **Fotos**: Substituir placeholders na `Gallery.jsx` por fotos reais do studio
- **Preços**: Adicionar valores reais em `Pricing.jsx`
- **Ícones PWA**: Substituir os SVGs em `public/icons/` por PNGs reais (192x192 e 512x512)
>>>>>>> 005e2d6 (Initial commit — Pilates by Riven)
