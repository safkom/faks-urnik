# Deployment na Digital Ocean

Ta vodič opisuje postopek namestitve aplikacije ŠC Kranj Urnik na Digital Ocean strežnik.

## Možnosti namestitve

### 1. Digital Ocean App Platform (Priporočeno - Najlažje)

App Platform je upravljana platforma, ki avtomatično upravlja z infrastrukturo.

#### Koraki:

1. **Pripravi GitHub repozitorij**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Ustvari novo aplikacijo na Digital Ocean**
   - Pojdi na https://cloud.digitalocean.com/apps
   - Klikni "Create App"
   - Izberi svoj GitHub repozitorij
   - Digital Ocean bo avtomatsko zaznal Node.js aplikacijo

3. **Konfiguriraj nastavitve**
   - **Name**: `sc-kranj-urnik`
   - **Region**: Frankfurt (najbližji Sloveniji)
   - **Plan**: Basic ($5/mesec)
   - **Build Command**: `npm install`
   - **Run Command**: `npm start`
   - **HTTP Port**: `3001`

4. **Environment Variables** (opcijsko)
   ```
   PORT=3001
   NODE_ENV=production
   ```

5. **Deploy**
   - Klikni "Create Resources"
   - Aplikacija bo avtomatično nameščena v ~5 minutah
   - Dobiš javni URL (npr. `https://sc-kranj-urnik-xxxxx.ondigitalocean.app`)

#### Cena: $5/mesec

---

### 2. Digital Ocean Droplet (VPS)

Za več nadzora in prilagodljivosti uporabi Droplet.

#### Koraki:

**1. Ustvari Droplet**
   - Pojdi na https://cloud.digitalocean.com/droplets
   - Klikni "Create Droplet"
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic - $6/mesec (1GB RAM, 1 vCPU)
   - **Region**: Frankfurt
   - **Authentication**: SSH keys (ali password)
   - **Hostname**: `sc-kranj-urnik`

**2. Poveži se na strežnik**
   ```bash
   ssh root@your-droplet-ip
   ```

**3. Posodobi sistem**
   ```bash
   apt update && apt upgrade -y
   ```

**4. Namesti Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   node --version  # Preveri verzijo
   npm --version
   ```

**5. Namesti Git**
   ```bash
   apt install -y git
   ```

**6. Kloniraj projekt**
   ```bash
   cd /var/www
   git clone <your-github-repo-url> sc-kranj-urnik
   cd sc-kranj-urnik
   ```

   ALI naloži datoteke ročno:
   ```bash
   mkdir -p /var/www/sc-kranj-urnik
   # Uporabi scp ali FileZilla za prenos datotek
   ```

**7. Namesti odvisnosti**
   ```bash
   cd /var/www/sc-kranj-urnik
   npm install
   ```

**8. Testiraj aplikacijo**
   ```bash
   npm start
   # Obišči http://your-droplet-ip:3001
   ```

**9. Namesti PM2 (Process Manager)**
   ```bash
   npm install -g pm2
   pm2 start server.js --name sc-kranj-urnik
   pm2 startup  # Nastavi avtomatski zagon ob restartu
   pm2 save
   ```

   Uporabni PM2 ukazi:
   ```bash
   pm2 status          # Status aplikacije
   pm2 logs            # Poglej loge
   pm2 restart all     # Restart aplikacije
   pm2 stop all        # Ustavi aplikacije
   ```

**10. Namesti Nginx (Reverse Proxy)**
   ```bash
   apt install -y nginx
   ```

   Ustvari konfiguracijo:
   ```bash
   nano /etc/nginx/sites-available/sc-kranj-urnik
   ```

   Dodaj naslednjo konfiguracijo:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;  # Zamenjaj s svojo domeno ali IP

       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   Aktiviraj konfiguracijo:
   ```bash
   ln -s /etc/nginx/sites-available/sc-kranj-urnik /etc/nginx/sites-enabled/
   nginx -t  # Testira konfiguracijo
   systemctl restart nginx
   ```

**11. Nastavi firewall**
   ```bash
   ufw allow 22/tcp    # SSH
   ufw allow 80/tcp    # HTTP
   ufw allow 443/tcp   # HTTPS
   ufw enable
   ufw status
   ```

**12. (Opcijsko) Namesti SSL certifikat s Let's Encrypt**
   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d your-domain.com
   ```

   Certbot bo avtomatsko konfiguriral HTTPS in nastavil avtomatsko obnavljanje.

#### Posodobitev aplikacije:
   ```bash
   cd /var/www/sc-kranj-urnik
   git pull origin main
   npm install
   pm2 restart sc-kranj-urnik
   ```

#### Cena: $6/mesec (Droplet) + $1-2/mesec (opcijsko backup)

---

### 3. Digital Ocean Container Registry + App Platform

Za Docker deployment.

**1. Ustvari Dockerfile**
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   EXPOSE 3001
   CMD ["npm", "start"]
   ```

**2. Ustvari .dockerignore**
   ```
   node_modules
   npm-debug.log
   .git
   .gitignore
   .env
   ```

**3. Build in push Docker image**
   ```bash
   doctl auth init
   doctl registry create sc-kranj-urnik
   doctl registry login

   docker build -t registry.digitalocean.com/sc-kranj-urnik/app:latest .
   docker push registry.digitalocean.com/sc-kranj-urnik/app:latest
   ```

**4. Deploy na App Platform**
   - Izberi "Docker Hub or Container Registry" kot vir
   - Poveži z Digital Ocean Container Registry

---

## Priporočila

### Za začetnike:
**Digital Ocean App Platform** - Brez skrbi za infrastrukturo, avtomatski deploy iz Git.

### Za napredne uporabnike:
**Droplet z Nginx** - Več nadzora, cenejše za več aplikacij, možnost prilagoditev.

### Za produkcijo:
- Uporabi **SSL certifikat** (Let's Encrypt je brezplačen)
- Nastavi **backupe** (Digital Ocean Droplet Backups - $1.20/mesec)
- Dodaj **monitoring** (Digital Ocean Monitoring je brezplačen)
- Uporabi **CDN** za statične datoteke (opcijsko)

---

## Testiranje

Po namestitvi preveri:
- [ ] Aplikacija se naloži na http://your-url
- [ ] Urniki se pravilno prikazujejo
- [ ] Izvoz v iCal deluje
- [ ] Odzivnost na mobilnih napravah

---

## Troubleshooting

### Problem: Port 3001 ni dostopen
```bash
# Preveri, ali aplikacija teče
pm2 status
# Preveri, ali port posluša
netstat -tlnp | grep 3001
# Preveri firewall
ufw status
```

### Problem: Nginx 502 Bad Gateway
```bash
# Preveri PM2
pm2 logs
# Preveri Nginx
nginx -t
systemctl status nginx
# Preveri povezavo
curl http://localhost:3001
```

### Problem: SSL certifikat ne deluje
```bash
# Preveri certbot
certbot certificates
# Obnovi certifikat
certbot renew --dry-run
```

---

## Dodatne informacije

- **Digital Ocean Dashboard**: https://cloud.digitalocean.com
- **Dokumentacija**: https://docs.digitalocean.com
- **Community**: https://www.digitalocean.com/community
- **Status**: https://status.digitalocean.com

---

## Stroški (povzetek)

| Metoda | Cena | Primernost |
|--------|------|------------|
| App Platform | $5/mesec | Začetniki, hiter deploy |
| Droplet (1GB) | $6/mesec | Napredni, več nadzora |
| Droplet + SSL | $6/mesec | Produkcija (SSL brezplačen) |
| Droplet + Backups | $7.20/mesec | Produkcija z backupi |

**Vse metode vključujejo:**
- Neomejen bandwidth
- Brezplačen SSL certifikat (Let's Encrypt)
- IPv4 & IPv6
- 24/7 dostop
