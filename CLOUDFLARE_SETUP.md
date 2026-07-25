# Cloudflare & Domain Setup — tikhatpartner.online

Complete guide for DNS, SSL (Full Strict), security rules, real client IP,
and locking the origin server so only Cloudflare can reach ports 80/443.

---

## 1. Add the site to Cloudflare

1. Create / log into a Cloudflare account
2. **Add a site** → enter `tikhatpartner.online`
3. Choose a plan (Free is enough to start)
4. Cloudflare scans existing DNS — review then continue
5. Change nameservers at your registrar to the two Cloudflare nameservers shown
6. Wait until the domain status is **Active**

---

## 2. DNS records

In **Cloudflare → DNS → Records**, configure:

| Type | Name | Content | Proxy status | TTL |
|------|------|---------|--------------|-----|
| **A** | `@` | `<ORIGIN_SERVER_PUBLIC_IP>` | **Proxied** (orange cloud) | Auto |
| **A** | `www` | `<ORIGIN_SERVER_PUBLIC_IP>` | **Proxied** (orange cloud) | Auto |
| **CNAME** | `www` | `tikhatpartner.online` | **Proxied** | Auto |

Notes:

- Use either two **A** records (`@` + `www`) **or** `A` for `@` + **CNAME** for `www` — not conflicting duplicates.
- Orange cloud **must** be on for SSL, bot protection, and hiding the origin IP.
- Grey cloud (DNS only) is for temporary debugging only.

Optional:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| **CNAME** | `api` | `tikhatpartner.online` | Proxied |

(Not required — the app serves API under `https://tikhatpartner.online/api/`.)

---

## 3. SSL/TLS mode — Full (Strict)

1. Go to **SSL/TLS → Overview**
2. Set encryption mode to **Full (Strict)**

### Origin certificate (recommended)

1. **SSL/TLS → Origin Server → Create certificate**
2. Hostnames: `tikhatpartner.online`, `*.tikhatpartner.online`
3. Validity: 15 years
4. Create → download **Origin Certificate** + **Private Key**
5. On the server:

```bash
sudo tee /etc/ssl/certs/tikhatpartner.pem > /dev/null <<'EOF'
-----BEGIN CERTIFICATE-----
...paste origin certificate...
-----END CERTIFICATE-----
EOF

sudo tee /etc/ssl/private/tikhatpartner.key > /dev/null <<'EOF'
-----BEGIN PRIVATE KEY-----
...paste private key...
-----END PRIVATE KEY-----
EOF

sudo chmod 644 /etc/ssl/certs/tikhatpartner.pem
sudo chmod 600 /etc/ssl/private/tikhatpartner.key
sudo nginx -t && sudo systemctl reload nginx
```

These paths match `nginx/tikhat.conf`.

Also enable:

- **SSL/TLS → Edge Certificates**
  - Always Use HTTPS: **On**
  - Automatic HTTPS Rewrites: **On**
  - Minimum TLS Version: **1.2**

---

## 4. Real client IP (critical for rate limiting)

### Why

With orange-cloud proxy, the origin sees Cloudflare edge IPs (often `103.x.x.x`) as `$remote_addr`.  
Login / OTP / API rate limits would then throttle Cloudflare, not the attacker.

### Nginx (already in `nginx/tikhat.conf`)

- `set_real_ip_from` for all [Cloudflare IP ranges](https://www.cloudflare.com/ips/)
- `real_ip_header CF-Connecting-IP;`
- `real_ip_recursive on;`
- Proxy to Node uses `$remote_addr` (now the visitor IP) in `X-Real-IP` / `X-Forwarded-For`

### Express (already configured — do not change for this task)

- `app.set('trust proxy', 1)` in `backend/src/app.js`
- Rate limiters and `getClientIp()` read `X-Forwarded-For` / `X-Real-IP`

### Verify

```bash
# After a browser request through the domain:
sudo tail -n 20 /var/log/nginx/access.log
# $remote_addr should be the visitor IP, not 103.x / 104.x Cloudflare ranges

pm2 logs tikhat-backend --lines 50
# Audit / auth logs should show the same real IP
```

Update Cloudflare IP ranges periodically:

```bash
curl -s https://www.cloudflare.com/ips-v4
curl -s https://www.cloudflare.com/ips-v6
```

Then refresh `set_real_ip_from` lines in `nginx/tikhat.conf` and reload Nginx.

---

## 5. Cloudflare security rules

### 5.1 Bot Fight Mode / Bot protection

1. **Security → Bots**
2. Enable **Bot Fight Mode** (Free) or Super Bot Fight Mode (paid)
3. Keep challenge pages enabled for likely automated traffic

### 5.2 Rate limiting (Cloudflare edge)

1. **Security → WAF → Rate limiting rules** (or **Security → Rate limiting**)
2. Create rules, for example:

| Rule | Match | Threshold | Action |
|------|-------|-----------|--------|
| Auth brute force | URI Path contains `/api/v1/auth/login` | 20 / 1 min / IP | Block 1 hour |
| OTP abuse | URI Path contains `/api/v1/auth` and Path contains `otp` | 10 / 1 min / IP | Block 1 hour |
| API flood | URI Path starts with `/api/` | 300 / 1 min / IP | Managed Challenge |

App-level limits still apply (login 10/15m, OTP 3/15m per email, etc.). Cloudflare is the first layer.

### 5.3 WAF / custom rules (recommended)

**Security → WAF → Custom rules** examples:

1. **Block empty user agents on API**  
   `(http.request.uri.path contains "/api/" and http.user_agent eq "")` → Block

2. **Challenge high threat scores**  
   `(cf.threat_score gt 30)` → Managed Challenge

3. **Geo allowlist (optional)**  
   If the product is India-only: `(not ip.geoip.country in {"IN"})` → Managed Challenge or Block

### 5.4 Other Security settings

| Setting | Recommended |
|---------|-------------|
| Security Level | Medium |
| Challenge Passage | 30 minutes |
| Browser Integrity Check | On |
| Privacy Pass Support | On |

---

## 6. Firewall — only Cloudflare may hit 80/443

Direct access to the origin IP must be blocked so attackers cannot bypass Cloudflare.

### 6.1 UFW (recommended)

```bash
# SSH first (use your admin IP if possible)
sudo ufw allow OpenSSH

# Reset HTTP/HTTPS allows
sudo ufw delete allow 80/tcp || true
sudo ufw delete allow 443/tcp || true

# Cloudflare IPv4 → 80/443
for ip in \
  173.245.48.0/20 \
  103.21.244.0/22 \
  103.22.200.0/22 \
  103.31.4.0/22 \
  141.101.64.0/18 \
  108.162.192.0/18 \
  190.93.240.0/20 \
  188.114.96.0/20 \
  197.234.240.0/22 \
  198.41.128.0/17 \
  162.158.0.0/15 \
  104.16.0.0/13 \
  104.24.0.0/14 \
  172.64.0.0/13 \
  131.0.72.0/22
do
  sudo ufw allow from "$ip" to any port 80 proto tcp
  sudo ufw allow from "$ip" to any port 443 proto tcp
done

# Cloudflare IPv6 → 80/443
for ip in \
  2400:cb00::/32 \
  2606:4700::/32 \
  2803:f800::/32 \
  2405:b500::/32 \
  2405:8100::/32 \
  2a06:98c0::/29 \
  2c0f:f248::/32
do
  sudo ufw allow from "$ip" to any port 80 proto tcp
  sudo ufw allow from "$ip" to any port 443 proto tcp
done

sudo ufw --force enable
sudo ufw status numbered
```

Keep **SSH** allowed from your admin IP only when possible:

```bash
sudo ufw allow from <YOUR_ADMIN_IP> to any port 22 proto tcp
```

### 6.2 Nginx allow-list snippet (optional second layer)

Create `/etc/nginx/snippets/cloudflare-only.conf`:

```nginx
# Allow Cloudflare only; deny everything else
allow 173.245.48.0/20;
allow 103.21.244.0/22;
allow 103.22.200.0/22;
allow 103.31.4.0/22;
allow 141.101.64.0/18;
allow 108.162.192.0/18;
allow 190.93.240.0/20;
allow 188.114.96.0/20;
allow 197.234.240.0/22;
allow 198.41.128.0/17;
allow 162.158.0.0/15;
allow 104.16.0.0/13;
allow 104.24.0.0/14;
allow 172.64.0.0/13;
allow 131.0.72.0/22;
allow 2400:cb00::/32;
allow 2606:4700::/32;
allow 2803:f800::/32;
allow 2405:b500::/32;
allow 2405:8100::/32;
allow 2a06:98c0::/29;
allow 2c0f:f248::/32;
deny all;
```

Then uncomment in `nginx/tikhat.conf`:

```nginx
include /etc/nginx/snippets/cloudflare-only.conf;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Enable this only after** DNS is proxied through Cloudflare, or you will lock yourself out of HTTP/HTTPS.

---

## 7. End-to-end verification checklist

- [ ] Nameservers active in Cloudflare
- [ ] A/CNAME records proxied (orange cloud)
- [ ] SSL/TLS mode = **Full (Strict)**
- [ ] Origin certificate installed; `nginx -t` passes
- [ ] `https://tikhatpartner.online` loads with valid certificate
- [ ] `https://tikhatpartner.online/api/health` returns success
- [ ] Nginx / app logs show **visitor** IPs (not Cloudflare `103.x`)
- [ ] UFW allows 80/443 only from Cloudflare ranges
- [ ] Bot Fight Mode on; edge rate-limit rules created
- [ ] Direct `http://ORIGIN_IP` is refused / times out from the public internet

---

## 8. Related files

| File | Role |
|------|------|
| `nginx/tikhat.conf` | Real IP restoration + reverse proxy |
| `CLOUDFLARE_SETUP.md` | This guide |
| `README.md` | Full deployment overview |
| `backend/src/app.js` | `trust proxy` for Express rate limits |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 525 / 526 SSL errors | Use Full Strict + valid Origin Certificate on Nginx |
| Logs show Cloudflare IPs | Confirm `real_ip_header CF-Connecting-IP` and `set_real_ip_from` lists are loaded; reload Nginx |
| Rate limits feel global | Real IP not restored — fix Nginx real_ip first |
| Site down after UFW | You blocked non-CF before enabling proxy — allow your IP temporarily on 80/443 or fix via SSH console |
| Too many challenges | Lower Security Level or adjust WAF custom rules |
