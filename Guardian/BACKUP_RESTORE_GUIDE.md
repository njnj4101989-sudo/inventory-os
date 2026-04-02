# Backup & Restore Guide — Inventory-OS

## Where Are Backups Stored?

All backups are stored in **AWS S3** (cloud storage, safe even if EC2/RDS dies):

| Folder | What | Retention |
|--------|------|-----------|
| `s3://inventory-os-backups-ap-south-1/daily/` | Automatic daily backups | Last 30 days |
| `s3://inventory-os-backups-ap-south-1/monthly/` | Monthly backup copy | Last 12 months |
| `s3://inventory-os-backups-ap-south-1/snapshots/` | Manual safety snapshots | Permanent (never auto-deleted) |

Backup runs automatically every night at **2:00 AM IST** via cron on EC2.

---

## Where To Run These Commands?

All commands run on the **EC2 server** (not your local PC). You need to SSH in first.

### Step 0: Connect to EC2 Server

Open **Command Prompt** or **Git Bash** on your PC and type:

```bash
ssh -i <path-to-key-file> ubuntu@43.204.66.254
```

Replace `<path-to-key-file>` with wherever the `.pem` key is saved on **your** PC. Examples:
- Nitish's PC: `ssh -i <path-to-key-file> ubuntu@43.204.66.254`
- Another PC: `ssh -i C:\Users\YourName\Desktop\drs-inventory-key.pem ubuntu@43.204.66.254`

**Note:** The `.pem` key file must be on the PC you're connecting from. If you're on a new PC, copy the key file there first.

You are now inside the EC2 server. All commands below run here.

---

## Daily Health Check

**Is today's backup done?**
```bash
bash /home/ubuntu/scripts/check-backup.sh
```
- Exit 0 = backup exists for today
- Exit 1 = no backup today (something went wrong)

**See backup log:**
```bash
tail -20 /var/log/backup.log
```

**Check if backup failed (flag file):**
```bash
ls -la /home/ubuntu/scripts/BACKUP_FAILED
```
If this file exists, last backup failed. Check the log above for details.

---

## List Available Backups

```bash
# Recent daily backups
aws s3 ls s3://inventory-os-backups-ap-south-1/daily/

# Monthly backups
aws s3 ls s3://inventory-os-backups-ap-south-1/monthly/

# Manual snapshots (permanent)
aws s3 ls s3://inventory-os-backups-ap-south-1/snapshots/
```

---

## How To Restore (When Database Is Compromised)

### Step 1: SSH into EC2
```bash
ssh -i <path-to-key-file> ubuntu@43.204.66.254
```

### Step 2: Choose which backup to restore

Pick one from the list commands above. Examples:
- Latest daily: `daily/2026-04-01_20-30.dump`
- Pre-wipe snapshot: `snapshots/pre-real-wipe_2026-04-01_08-33.dump`

### Step 3: Run the restore script

```bash
bash /home/ubuntu/scripts/restore.sh daily/2026-04-01_20-30.dump
```

Replace the filename with whichever backup you want to restore.

### Step 4: Confirm

The script will show you the backup details and ask you to type **RESTORE** (all caps) to confirm. This is a safety gate — it won't run without your confirmation.

### Step 5: Wait

The script downloads the backup from S3 and restores it into the RDS database. This takes 1-2 minutes for the current database size.

### Step 6: Verify

After restore completes, check the app:
- Open `https://inventory.drsblouse.com`
- Login and verify data looks correct
- Check a few orders, SKUs, rolls to confirm

---

## Take a Manual Snapshot (Before Risky Operations)

**Always do this before:** running migrations, deleting data, or any risky database change.

```bash
bash /home/ubuntu/scripts/snapshot.sh give-it-a-name
```

Example:
```bash
bash /home/ubuntu/scripts/snapshot.sh pre-migration-s102
```

This uploads immediately to `s3://inventory-os-backups-ap-south-1/snapshots/` and is never auto-deleted.

---

## Emergency Quick Reference

| Situation | Command |
|-----------|---------|
| Check if backup ran today | `bash /home/ubuntu/scripts/check-backup.sh` |
| Take immediate snapshot | `bash /home/ubuntu/scripts/snapshot.sh {name}` |
| Restore from daily backup | `bash /home/ubuntu/scripts/restore.sh daily/{filename}` |
| Restore from snapshot | `bash /home/ubuntu/scripts/restore.sh snapshots/{filename}` |
| Check backup log | `tail -20 /var/log/backup.log` |
| List daily backups | `aws s3 ls s3://inventory-os-backups-ap-south-1/daily/` |
| List snapshots | `aws s3 ls s3://inventory-os-backups-ap-south-1/snapshots/` |
| Restart app after restore | `sudo systemctl restart fastapi` |

---

## Important Notes

- **Restore overwrites the current database** — take a snapshot first if current data matters
- **App may need restart** after restore: `sudo systemctl restart fastapi`
- **Snapshots are permanent** — clean them up manually if S3 storage grows
- **Daily backups auto-prune** after 30 days, monthly after 12 months
- **S3 bucket region:** ap-south-1 (Mumbai), same as RDS
- **S3 bucket has versioning + encryption** enabled for safety
