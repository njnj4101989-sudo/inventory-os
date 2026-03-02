# AWS Deployment Plan — Hybrid Architecture

> **Status:** SAVED for later. Complete remaining modules first, then deploy.
> **Owner:** Nitish (AWS account created, needs step-by-step guidance)

---

## Architecture (Hybrid — Final Decision S42)

```
  inventory.drsblouse.com          api-inventory.drsblouse.com
       → Vercel (FREE forever)          → AWS EC2 (t2.micro)
       → React PWA                      → Nginx + Gunicorn + FastAPI
       → Already configured             → RDS PostgreSQL behind it

  GoDaddy DNS:
    inventory  → CNAME → cname.vercel-dns.com
    api-inventory → A → EC2 Elastic IP
```

**Why hybrid:** Vercel = free forever + zero maintenance for frontend. AWS = proper backend server (solves Cloudflare tunnel blocker) + production PostgreSQL.

---

## Cost

| Period | Frontend | Backend (EC2) | Database (RDS) | Total |
|--------|----------|---------------|----------------|-------|
| Year 1 | ₹0 (Vercel) | ₹0 (free tier) | ₹0 (free tier) | **₹0** |
| Year 2+ | ₹0 (Vercel) | ~₹800/mo | ~₹1,500/mo | **~₹2,300/mo** |

---

## Prerequisites (Before Starting)

- [x] AWS Account created (console.aws.amazon.com)
- [x] GoDaddy access for drsblouse.com
- [x] GitHub repo: `njnj4101989-sudo/inventory-os`
- [ ] AWS CLI installed locally: `pip install awscli`
- [ ] AWS region set: `ap-south-1` (Mumbai)

---

## Execution Order (7 Steps)

### Step 1: AWS Region + IAM
- Login → top-right → select `ap-south-1 (Mumbai)`
- Create IAM user `github-deployer` with `AmazonS3FullAccess` + `CloudFrontFullAccess`
- Save Access Key ID + Secret

### Step 2: EC2 Instance (Backend Server)
1. Create key pair: `drs-inventory-key` (.pem) → SAVE SECURELY
2. Launch `t2.micro` Ubuntu 22.04 → security group: SSH(22)+HTTP(80)+HTTPS(443)
3. Allocate Elastic IP → associate to instance → note the IP
4. SSH in: `ssh -i drs-inventory-key.pem ubuntu@ELASTIC_IP`
5. Install: Python 3.11, git, nginx, pip
6. Clone repo: `git clone https://github.com/njnj4101989-sudo/inventory-os.git`
7. Setup venv: `python3.11 -m venv venv && pip install -r backend/requirements.txt`
8. Create `/home/ubuntu/backend/.env` (DATABASE_URL, SECRET_KEY, ALLOWED_ORIGINS)
9. Create systemd service (`app.main:app` — our FastAPI entry point)
10. Configure Nginx reverse proxy → `api-inventory.drsblouse.com`
11. Install SSL: `sudo certbot --nginx -d api-inventory.drsblouse.com`

### Step 3: RDS PostgreSQL
1. Create `db.t3.micro` PostgreSQL 16.x → name: `drs-inventory-db`
2. Database name: `drs_inventory`, user: `postgres`
3. Security group: allow port 5432 ONLY from EC2 security group (not 0.0.0.0/0)
4. For local access: SSH tunnel through EC2 (`ssh -L 5432:RDS_ENDPOINT:5432`)
5. Run Alembic migrations from EC2
6. Run seed data script

### Step 4: Codebase Changes (Do Before Deploy)
| Change | File | What |
|--------|------|------|
| DB driver | `backend/requirements.txt` | `+asyncpg +psycopg2-binary`, `-aiosqlite` |
| DB URL | `backend/app/core/database.py` | Support `postgresql+asyncpg://` |
| Fresh migration | `backend/migrations/` | Regenerate for PostgreSQL |
| CORS | `backend/app/main.py` | Remove `trycloudflare.com`, add `https://inventory.drsblouse.com` |
| API URL | `frontend/.env.production` | `VITE_API_URL=https://api-inventory.drsblouse.com` |
| Gunicorn | systemd service | `gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker` |

### Step 5: Vercel Frontend Deploy
1. Import repo on Vercel → root directory: `frontend`
2. Set env var: `VITE_API_URL=https://api-inventory.drsblouse.com`
3. Build command: `npm run build` (auto-detected)
4. GoDaddy: CNAME `inventory` → `cname.vercel-dns.com`
5. Vercel: Add custom domain `inventory.drsblouse.com`

### Step 6: GoDaddy DNS
| Type | Name | Value |
|------|------|-------|
| CNAME | inventory | cname.vercel-dns.com |
| A | api-inventory | EC2_ELASTIC_IP |

Don't touch existing `www` and `api` records.

### Step 7: CI/CD (GitHub Actions)
- **Frontend:** On push to `main` (paths: `frontend/**`) → Vercel auto-deploys (built-in)
- **Backend:** On push to `main` (paths: `backend/**`) → SSH to EC2, git pull, pip install, restart fastapi

```yaml
# .github/workflows/deploy-backend.yml
name: Deploy Backend
on:
  push:
    branches: [main]
    paths: ['backend/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /home/ubuntu/inventory-os/backend
            git pull origin main
            source venv/bin/activate
            pip install -r requirements.txt
            sudo systemctl restart fastapi
```

---

## Post-Deploy Checklist

- [ ] `https://inventory.drsblouse.com` → React PWA loads
- [ ] `https://api-inventory.drsblouse.com/docs` → Swagger loads
- [ ] Login works: admin, supervisor, tailor1, checker1, billing
- [ ] QR scanner works on phone (HTTPS required)
- [ ] Mobile PWA install prompt works
- [ ] RDS security group locked to EC2 only
- [ ] CloudWatch alarms: EC2 CPU, RDS CPU, RDS storage
- [ ] CI/CD: push to main → auto deploys

---

## Monitoring & Backup

- **RDS:** Auto backup 7 days, encryption enabled
- **Monthly:** `aws rds create-db-snapshot` from EC2
- **Year-end:** `pg_dump` → upload to S3
- **CloudWatch:** CPU > 80% alert, storage < 2GB alert
- **Health check:** `curl https://api-inventory.drsblouse.com/api/v1/health`

---

## Troubleshooting Quick Reference

| Problem | Check |
|---------|-------|
| 502 Bad Gateway | `sudo systemctl status fastapi` → `sudo journalctl -u fastapi -n 50` |
| 500 Internal Error | Logs + check `.env` DATABASE_URL |
| Camera not opening | Must be HTTPS (PWA requirement) |
| DB connection timeout | RDS security group + endpoint in .env |
| Old version after deploy | CloudFront: run invalidation / Vercel: auto |
| SSH denied | Check key permissions: `chmod 400 drs-inventory-key.pem` |

---

## Useful Commands

```bash
# SSH
ssh -i drs-inventory-key.pem ubuntu@ELASTIC_IP

# FastAPI service
sudo systemctl status/restart/stop fastapi
sudo journalctl -u fastapi -f          # live logs

# Nginx
sudo nginx -t && sudo systemctl restart nginx

# DB (via SSH tunnel)
ssh -L 5432:RDS_ENDPOINT:5432 -i key.pem ubuntu@EC2_IP
psql -h localhost -U postgres -d drs_inventory

# SSL renewal
sudo certbot renew --dry-run
```
